from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import platform
import socket
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.robotparser import RobotFileParser

import requests

logger = logging.getLogger(__name__)

EVIDENCE_FORMAT_VERSION = "1.0"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_USER_AGENT = "Navisio-Robots-Evidence/1.0 (+https://navisio.nl)"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "analysis" / "compliance" / "robots_evidence"


@dataclass(frozen=True)
class RobotsTarget:
    source_key: str
    host: str
    relevant_paths: tuple[str, ...]
    scheme: str = "https"
    robots_path: str = "/robots.txt"

    @property
    def robots_url(self) -> str:
        return f"{self.scheme}://{self.host}{self.robots_path}"


DEFAULT_TARGETS_BY_SOURCE: dict[str, tuple[RobotsTarget, ...]] = {
    "galle": (
        RobotsTarget(
            source_key="galle",
            host="gallemakelaars.nl",
            relevant_paths=("/scheepsaanbod",),
        ),
    ),
    "rensendriessen": (
        RobotsTarget(
            source_key="rensendriessen",
            host="www.rensendriessen.com",
            relevant_paths=("/brokerage/vessels-for-sale/details",),
        ),
        RobotsTarget(
            source_key="rensendriessen",
            host="api.rensendriessen.com",
            relevant_paths=("/api/public/ships/brokers/list/filter/",),
        ),
    ),
    "pcshipbrokers": (
        RobotsTarget(
            source_key="pcshipbrokers",
            host="pcshipbrokers.com",
            relevant_paths=("/scheepsaanbod", "/ships/"),
        ),
    ),
    "gtsschepen": (
        RobotsTarget(
            source_key="gtsschepen",
            host="www.gtsschepen.nl",
            relevant_paths=("/schepen/",),
        ),
    ),
    "gsk": (
        RobotsTarget(
            source_key="gsk",
            host="www.gskbrokers.eu",
            relevant_paths=("/graphql", "/nl/schip/"),
        ),
    ),
}


def _iso_utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _run_id_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def _safe_file_stem(target: RobotsTarget) -> str:
    host_slug = target.host.replace(".", "_")
    source_slug = target.source_key.replace(".", "_")
    return f"{source_slug}__{host_slug}"


def _safe_git_value(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned if cleaned else None


def _git_value(*args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return _safe_git_value(result.stdout)


def _git_state() -> dict[str, Any]:
    status_output = _git_value("status", "--porcelain") or ""
    return {
        "commit": _git_value("rev-parse", "HEAD"),
        "branch": _git_value("rev-parse", "--abbrev-ref", "HEAD"),
        "is_dirty": bool(status_output.strip()),
    }


def _parse_sources(raw_sources: str | None) -> list[str]:
    if raw_sources:
        return [item.strip() for item in raw_sources.split(",") if item.strip()]
    default_raw = os.environ.get("PIPELINE_V3_SOURCES", "galle,rensendriessen,pcshipbrokers,gtsschepen,gsk")
    return [item.strip() for item in default_raw.split(",") if item.strip()]


def _resolve_targets(raw_sources: str | None) -> list[RobotsTarget]:
    selected_sources = _parse_sources(raw_sources)
    targets: list[RobotsTarget] = []
    unknown: list[str] = []
    for source in selected_sources:
        chunk = DEFAULT_TARGETS_BY_SOURCE.get(source)
        if not chunk:
            unknown.append(source)
            continue
        targets.extend(chunk)
    if unknown:
        logger.warning("Unknown source keys in --sources/PIPELINE_V3_SOURCES: %s", ", ".join(sorted(set(unknown))))
    return targets


def _normalize_headers(response: requests.Response) -> list[dict[str, str]]:
    return [{"name": str(name), "value": str(value)} for name, value in sorted(response.headers.items())]


def _robots_permissions(
    robots_body: bytes | None,
    relevant_paths: tuple[str, ...],
    user_agent: str,
    status_code: int | None,
) -> dict[str, bool | None]:
    if not robots_body or not relevant_paths:
        return {path: None for path in relevant_paths}
    if status_code is None or status_code >= 400:
        return {path: None for path in relevant_paths}

    try:
        text = robots_body.decode("utf-8", errors="replace")
    except Exception:
        return {path: None for path in relevant_paths}

    parser = RobotFileParser()
    parser.parse(text.splitlines())

    permissions: dict[str, bool | None] = {}
    for path in relevant_paths:
        try:
            permissions[path] = bool(parser.can_fetch(user_agent, path))
        except Exception:
            permissions[path] = None
    return permissions


def _fetch_target(
    target: RobotsTarget,
    timeout_seconds: int,
    user_agent: str,
    http_get: Callable[..., requests.Response],
) -> dict[str, Any]:
    started_at = _iso_utc_now()
    request_headers = {
        "User-Agent": user_agent,
        "Accept": "text/plain, */*;q=0.5",
    }

    try:
        response = http_get(
            target.robots_url,
            headers=request_headers,
            timeout=timeout_seconds,
            allow_redirects=True,
        )
        body = response.content
        status_code = int(response.status_code)
        result = {
            "source_key": target.source_key,
            "host": target.host,
            "requested_url": target.robots_url,
            "final_url": str(response.url),
            "status_code": status_code,
            "reason": str(response.reason or ""),
            "response_headers": _normalize_headers(response),
            "body_bytes": body,
            "body_sha256": _sha256_bytes(body),
            "error": None,
            "fetched_at_utc": started_at,
            "completed_at_utc": _iso_utc_now(),
            "relevant_paths": list(target.relevant_paths),
            "robots_permissions": _robots_permissions(body, target.relevant_paths, user_agent, status_code),
        }
        return result
    except requests.RequestException as exc:
        return {
            "source_key": target.source_key,
            "host": target.host,
            "requested_url": target.robots_url,
            "final_url": None,
            "status_code": None,
            "reason": None,
            "response_headers": [],
            "body_bytes": None,
            "body_sha256": None,
            "error": f"{exc.__class__.__name__}: {exc}",
            "fetched_at_utc": started_at,
            "completed_at_utc": _iso_utc_now(),
            "relevant_paths": list(target.relevant_paths),
            "robots_permissions": {path: None for path in target.relevant_paths},
        }


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True) + "\n", encoding="utf-8")


def _openssl_available() -> bool:
    try:
        result = subprocess.run(["openssl", "version"], capture_output=True, text=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False
    return bool(result.stdout.strip())


def _sign_manifest(
    bundle_dir: Path,
    canonical_manifest_path: Path,
    signing_key_path: Path,
) -> dict[str, Any]:
    signature_path = bundle_dir / "manifest.canonical.json.sig"
    public_key_path = bundle_dir / "signing.public.pem"

    subprocess.run(
        [
            "openssl",
            "dgst",
            "-sha256",
            "-sign",
            str(signing_key_path),
            "-out",
            str(signature_path),
            str(canonical_manifest_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    subprocess.run(
        ["openssl", "pkey", "-in", str(signing_key_path), "-pubout", "-out", str(public_key_path)],
        check=True,
        capture_output=True,
        text=True,
    )

    return {
        "enabled": True,
        "signing_key_path": str(signing_key_path),
        "signature_file": signature_path.name,
        "signature_sha256": _sha256_file(signature_path),
        "public_key_file": public_key_path.name,
        "public_key_sha256": _sha256_file(public_key_path),
    }


def _timestamp_manifest(
    bundle_dir: Path,
    canonical_manifest_path: Path,
    tsa_url: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    query_path = bundle_dir / "manifest.canonical.json.tsq"
    reply_path = bundle_dir / "manifest.canonical.json.tsr"
    reply_text_path = bundle_dir / "manifest.canonical.json.tsr.txt"

    subprocess.run(
        [
            "openssl",
            "ts",
            "-query",
            "-data",
            str(canonical_manifest_path),
            "-sha256",
            "-cert",
            "-out",
            str(query_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    query_bytes = query_path.read_bytes()
    response = requests.post(
        tsa_url,
        data=query_bytes,
        headers={"Content-Type": "application/timestamp-query"},
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    reply_path.write_bytes(response.content)

    subprocess.run(
        ["openssl", "ts", "-reply", "-in", str(reply_path), "-text", "-out", str(reply_text_path)],
        check=True,
        capture_output=True,
        text=True,
    )

    return {
        "enabled": True,
        "tsa_url": tsa_url,
        "query_file": query_path.name,
        "query_sha256": _sha256_file(query_path),
        "reply_file": reply_path.name,
        "reply_sha256": _sha256_file(reply_path),
        "reply_text_file": reply_text_path.name,
        "reply_text_sha256": _sha256_file(reply_text_path),
    }


def _write_sha256_sums(bundle_dir: Path) -> Path:
    checksum_path = bundle_dir / "SHA256SUMS.txt"
    files = sorted(
        [path for path in bundle_dir.rglob("*") if path.is_file() and path.name != checksum_path.name],
        key=lambda p: p.relative_to(bundle_dir).as_posix(),
    )
    lines = []
    for path in files:
        digest = _sha256_file(path)
        rel = path.relative_to(bundle_dir).as_posix()
        lines.append(f"{digest}  {rel}")
    checksum_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return checksum_path


def _load_previous_manifest_hash(chain_dir: Path) -> str | None:
    latest_path = chain_dir / "latest_manifest_sha256.txt"
    if not latest_path.exists():
        return None
    content = latest_path.read_text(encoding="utf-8").strip()
    return content or None


def _update_chain_ledger(
    output_root: Path,
    run_id: str,
    bundle_dir: Path,
    manifest_sha256: str,
    previous_manifest_sha256: str | None,
) -> None:
    chain_dir = output_root / "chain"
    chain_dir.mkdir(parents=True, exist_ok=True)

    ledger_path = chain_dir / "ledger.jsonl"
    ledger_record = {
        "recorded_at_utc": _iso_utc_now(),
        "run_id": run_id,
        "manifest_sha256": manifest_sha256,
        "previous_manifest_sha256": previous_manifest_sha256,
        "bundle_path": bundle_dir.relative_to(output_root).as_posix(),
    }
    with ledger_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(ledger_record, sort_keys=True, ensure_ascii=True))
        handle.write("\n")

    (chain_dir / "latest_manifest_sha256.txt").write_text(f"{manifest_sha256}\n", encoding="utf-8")


def _build_manifest(
    *,
    run_id: str,
    output_root: Path,
    bundle_dir: Path,
    requested_sources: list[str],
    user_agent: str,
    timeout_seconds: int,
    results: list[dict[str, Any]],
    previous_manifest_sha256: str | None,
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    success_count = 0
    network_error_count = 0
    non_ok_status_count = 0

    for result in results:
        if result["error"]:
            network_error_count += 1
        else:
            success_count += 1
            if int(result["status_code"] or 0) >= 400:
                non_ok_status_count += 1

        entries.append(
            {
                "source_key": result["source_key"],
                "host": result["host"],
                "requested_url": result["requested_url"],
                "final_url": result["final_url"],
                "status_code": result["status_code"],
                "reason": result["reason"],
                "error": result["error"],
                "fetched_at_utc": result["fetched_at_utc"],
                "completed_at_utc": result["completed_at_utc"],
                "relevant_paths": result["relevant_paths"],
                "robots_permissions": result["robots_permissions"],
                "files": {
                    "body": result["body_file"],
                    "body_sha256": result["body_sha256"],
                    "metadata": result["metadata_file"],
                    "metadata_sha256": result["metadata_sha256"],
                },
            }
        )

    manifest: dict[str, Any] = {
        "format_version": EVIDENCE_FORMAT_VERSION,
        "run_id": run_id,
        "captured_at_utc": _iso_utc_now(),
        "output_root": str(output_root),
        "bundle_path": str(bundle_dir),
        "requested_sources": requested_sources,
        "capture_policy": {
            "timeout_seconds": timeout_seconds,
            "user_agent": user_agent,
        },
        "environment": {
            "hostname": socket.gethostname(),
            "platform": platform.platform(),
            "python_version": sys.version,
        },
        "git": _git_state(),
        "summary": {
            "target_count": len(results),
            "success_count": success_count,
            "network_error_count": network_error_count,
            "non_ok_status_count": non_ok_status_count,
        },
        "previous_manifest_sha256": previous_manifest_sha256,
        "targets": entries,
    }
    return manifest


def run_capture(
    *,
    output_root: Path,
    sources_raw: str | None,
    timeout_seconds: int,
    user_agent: str,
    strict_network_errors: bool,
    signing_key_path: Path | None,
    tsa_url: str | None,
    http_get: Callable[..., requests.Response] = requests.get,
) -> int:
    output_root.mkdir(parents=True, exist_ok=True)
    requested_sources = _parse_sources(sources_raw)
    targets = _resolve_targets(sources_raw)
    if not targets:
        raise ValueError("No known sources selected; nothing to capture.")

    run_id = _run_id_now()
    bundle_dir = output_root / run_id
    if bundle_dir.exists():
        raise RuntimeError(f"Evidence bundle directory already exists: {bundle_dir}")

    responses_dir = bundle_dir / "responses"
    responses_dir.mkdir(parents=True, exist_ok=False)

    logger.info("Capturing robots evidence for %d target host(s)", len(targets))
    results: list[dict[str, Any]] = []

    for target in targets:
        logger.info("Fetching %s", target.robots_url)
        fetched = _fetch_target(
            target=target,
            timeout_seconds=timeout_seconds,
            user_agent=user_agent,
            http_get=http_get,
        )

        stem = _safe_file_stem(target)
        body_file_rel: str | None = None
        body_sha256 = fetched["body_sha256"]

        if fetched["body_bytes"] is not None:
            body_path = responses_dir / f"{stem}.robots.txt"
            body_path.write_bytes(fetched["body_bytes"])
            body_file_rel = body_path.relative_to(bundle_dir).as_posix()

        metadata_payload = {
            "source_key": fetched["source_key"],
            "host": fetched["host"],
            "requested_url": fetched["requested_url"],
            "final_url": fetched["final_url"],
            "status_code": fetched["status_code"],
            "reason": fetched["reason"],
            "error": fetched["error"],
            "fetched_at_utc": fetched["fetched_at_utc"],
            "completed_at_utc": fetched["completed_at_utc"],
            "response_headers": fetched["response_headers"],
            "relevant_paths": fetched["relevant_paths"],
            "robots_permissions": fetched["robots_permissions"],
        }
        metadata_path = responses_dir / f"{stem}.metadata.json"
        _write_json(metadata_path, metadata_payload)

        fetched["body_file"] = body_file_rel
        fetched["body_sha256"] = body_sha256
        fetched["metadata_file"] = metadata_path.relative_to(bundle_dir).as_posix()
        fetched["metadata_sha256"] = _sha256_file(metadata_path)
        results.append(fetched)

    chain_dir = output_root / "chain"
    previous_manifest_sha256 = _load_previous_manifest_hash(chain_dir)

    manifest = _build_manifest(
        run_id=run_id,
        output_root=output_root,
        bundle_dir=bundle_dir,
        requested_sources=requested_sources,
        user_agent=user_agent,
        timeout_seconds=timeout_seconds,
        results=results,
        previous_manifest_sha256=previous_manifest_sha256,
    )

    canonical_manifest_bytes = _canonical_json_bytes(manifest)
    canonical_manifest_path = bundle_dir / "manifest.canonical.json"
    canonical_manifest_path.write_bytes(canonical_manifest_bytes)

    manifest_path = bundle_dir / "manifest.json"
    _write_json(manifest_path, manifest)

    manifest_sha256 = _sha256_bytes(canonical_manifest_bytes)
    manifest_sha_path = bundle_dir / "manifest.sha256"
    manifest_sha_path.write_text(f"{manifest_sha256}  {canonical_manifest_path.name}\n", encoding="utf-8")

    proof: dict[str, Any] = {
        "manifest_file": manifest_path.name,
        "canonical_manifest_file": canonical_manifest_path.name,
        "manifest_sha256_file": manifest_sha_path.name,
        "manifest_sha256": manifest_sha256,
    }

    signing_errors: list[str] = []
    if signing_key_path:
        try:
            if not _openssl_available():
                raise RuntimeError("OpenSSL is not available in PATH.")
            proof["signature"] = _sign_manifest(bundle_dir, canonical_manifest_path, signing_key_path)
        except Exception as exc:
            signing_errors.append(f"signature_failed: {exc}")
            logger.exception("Signature generation failed")

    timestamp_errors: list[str] = []
    if tsa_url:
        try:
            if not _openssl_available():
                raise RuntimeError("OpenSSL is not available in PATH.")
            proof["rfc3161_timestamp"] = _timestamp_manifest(bundle_dir, canonical_manifest_path, tsa_url, timeout_seconds)
        except Exception as exc:
            timestamp_errors.append(f"timestamp_failed: {exc}")
            logger.exception("RFC3161 timestamp generation failed")

    if signing_errors:
        proof["signature_errors"] = signing_errors
    if timestamp_errors:
        proof["timestamp_errors"] = timestamp_errors

    proof_path = bundle_dir / "proof.json"
    _write_json(proof_path, proof)

    checksum_path = _write_sha256_sums(bundle_dir)

    _update_chain_ledger(
        output_root=output_root,
        run_id=run_id,
        bundle_dir=bundle_dir,
        manifest_sha256=manifest_sha256,
        previous_manifest_sha256=previous_manifest_sha256,
    )

    logger.info("Evidence bundle created: %s", bundle_dir)
    logger.info("Manifest hash: %s", manifest_sha256)
    logger.info("Checksums file: %s", checksum_path)

    network_errors = [result for result in results if result["error"]]
    if strict_network_errors and network_errors:
        logger.error("Strict mode enabled; failing because %d network request(s) failed.", len(network_errors))
        return 1
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture tamper-evident robots.txt evidence bundles for scraper source domains."
    )
    parser.add_argument(
        "--output-root",
        default=str(DEFAULT_OUTPUT_ROOT),
        help="Directory that stores evidence bundles and chain ledger.",
    )
    parser.add_argument(
        "--sources",
        default=None,
        help="Comma-separated source allowlist. Defaults to PIPELINE_V3_SOURCES or full default set.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="HTTP timeout for each robots.txt request.",
    )
    parser.add_argument(
        "--user-agent",
        default=os.environ.get("ROBOTS_EVIDENCE_USER_AGENT", DEFAULT_USER_AGENT),
        help="User-Agent sent when fetching robots.txt.",
    )
    parser.add_argument(
        "--strict-network-errors",
        action="store_true",
        help="Return non-zero if any robots.txt request fails due to network/transport errors.",
    )
    parser.add_argument(
        "--signing-key-path",
        default=os.environ.get("ROBOTS_EVIDENCE_SIGNING_KEY_PATH"),
        help="Optional PEM private key path for detached OpenSSL signature.",
    )
    parser.add_argument(
        "--tsa-url",
        default=os.environ.get("ROBOTS_EVIDENCE_TSA_URL"),
        help="Optional RFC3161 TSA endpoint URL for trusted timestamping.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    output_root = Path(args.output_root).expanduser().resolve()
    signing_key_path = Path(args.signing_key_path).expanduser().resolve() if args.signing_key_path else None

    exit_code = run_capture(
        output_root=output_root,
        sources_raw=args.sources,
        timeout_seconds=args.timeout_seconds,
        user_agent=args.user_agent,
        strict_network_errors=bool(args.strict_network_errors),
        signing_key_path=signing_key_path,
        tsa_url=args.tsa_url,
    )
    raise SystemExit(exit_code)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    main()
