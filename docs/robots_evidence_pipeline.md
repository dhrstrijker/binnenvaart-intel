# Robots.txt Evidence Pipeline

This project includes an automated, tamper-evident pipeline for recording `robots.txt` access rules for all active scraper source hosts.

Implementation:

- Collector: `scraper/robots_evidence.py`
- Automation: `.github/workflows/robots-evidence.yml`
- Storage root: `analysis/compliance/robots_evidence/`

## What Gets Stored Per Run

Each run creates one bundle directory: `analysis/compliance/robots_evidence/<UTC_RUN_ID>/`.

Bundle contents:

- `responses/*.robots.txt`: raw fetched body bytes for each host.
- `responses/*.metadata.json`: request/response metadata (status, headers, URLs, errors, timing).
- `manifest.json`: human-readable run manifest.
- `manifest.canonical.json`: deterministic JSON used for hashing/signing.
- `manifest.sha256`: SHA-256 digest of `manifest.canonical.json`.
- `proof.json`: signature/timestamp proof metadata (when configured).
- `SHA256SUMS.txt`: SHA-256 checksums for all files in the bundle.

Chain files (across runs):

- `analysis/compliance/robots_evidence/chain/ledger.jsonl`
- `analysis/compliance/robots_evidence/chain/latest_manifest_sha256.txt`

The chain links every new run to the prior manifest hash (`previous_manifest_sha256`) so edits become detectable.

## Source Coverage

Current source-to-host mapping:

- `galle` -> `https://gallemakelaars.nl/robots.txt`
- `rensendriessen` -> `https://www.rensendriessen.com/robots.txt`
- `rensendriessen` (API host) -> `https://api.rensendriessen.com/robots.txt`
- `pcshipbrokers` -> `https://pcshipbrokers.com/robots.txt`
- `gtsschepen` -> `https://www.gtsschepen.nl/robots.txt`
- `gsk` -> `https://www.gskbrokers.eu/robots.txt`

For each host, the manifest also records `robots_permissions` for the scraper’s relevant request paths.

## Local Run

From repo root:

```bash
python scraper/robots_evidence.py \
  --output-root analysis/compliance/robots_evidence \
  --strict-network-errors
```

Optional flags:

- `--sources galle,rensendriessen`
- `--signing-key-path /absolute/path/private_key.pem`
- `--tsa-url https://example-tsa.invalid`

Environment alternatives:

- `ROBOTS_EVIDENCE_SIGNING_KEY_PATH`
- `ROBOTS_EVIDENCE_TSA_URL`
- `ROBOTS_EVIDENCE_USER_AGENT`

## GitHub Action Operation

Workflow: `.github/workflows/robots-evidence.yml`

- Scheduled daily at `03:17 UTC`.
- Also supports manual `workflow_dispatch`.
- Uploads captured evidence as workflow artifact.
- Commits updated evidence files into the repository.

Optional secrets:

- `ROBOTS_EVIDENCE_SIGNING_KEY_B64`: base64-encoded PEM private key for OpenSSL detached signature.
- `ROBOTS_EVIDENCE_TSA_URL`: RFC3161 timestamp authority endpoint.

## Verification Checklist

For a specific bundle directory:

```bash
cd analysis/compliance/robots_evidence/<UTC_RUN_ID>
sha256sum -c manifest.sha256
sha256sum -c SHA256SUMS.txt
```

If signing is enabled:

```bash
openssl dgst -sha256 -verify signing.public.pem \
  -signature manifest.canonical.json.sig \
  manifest.canonical.json
```

If RFC3161 timestamping is enabled, preserve `*.tsq`, `*.tsr`, and `*.tsr.txt` as part of the evidence package.
