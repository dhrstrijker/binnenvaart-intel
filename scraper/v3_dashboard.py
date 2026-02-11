from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import create_client


DEFAULT_SOURCES = ("galle", "rensendriessen", "pcshipbrokers", "gtsschepen", "gsk")
RUN_TYPES = ("detect", "detail-worker", "reconcile")

# Grace window before a run type is considered stale.
STALE_AFTER_MINUTES = {
    "detect": 45,
    "detail-worker": 45,
    "reconcile": 480,
}

RUN_COLUMNS = ",".join(
    [
        "id",
        "source",
        "run_type",
        "mode",
        "status",
        "started_at",
        "finished_at",
        "external_request_count",
        "supabase_read_count",
        "supabase_write_count",
        "parse_fail_count",
        "selector_fail_count",
        "detail_fetch_count",
        "staged_count",
        "queue_depth",
        "queue_oldest_age_minutes",
        "notification_latency_seconds_p95",
        "inserted_count",
        "price_changed_count",
        "sold_count",
        "removed_count",
        "unchanged_count",
        "run_duration_seconds",
        "error_message",
        "metadata",
        "created_at",
    ]
)

SOURCE_HEALTH_COLUMNS = ",".join(
    [
        "source",
        "trailing_median_count",
        "trailing_p95_count",
        "last_vessel_count",
        "last_run_status",
        "last_run_type",
        "last_run_at",
        "last_parse_fail_ratio",
        "last_selector_fail_count",
        "consecutive_healthy_runs",
        "consecutive_unhealthy_runs",
        "consecutive_miss_candidates",
        "updated_at",
    ]
)

QUEUE_COLUMNS = "source,status,created_at,next_attempt_at,attempt_count,last_error"


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _to_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fmt_dt(value: Any) -> str:
    parsed = _parse_ts(value)
    if not parsed:
        return "-"
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _fmt_minutes(value: Any) -> str:
    if value is None:
        return "-"
    return f"{_to_float(value):.1f}m"


def _fmt_seconds(value: Any) -> str:
    if value is None:
        return "-"
    return f"{_to_float(value):.1f}s"


def _fmt_duration_seconds(value: Any) -> str:
    if value is None:
        return "-"
    sec = _to_float(value)
    if sec < 60:
        return f"{sec:.1f}s"
    minutes = sec / 60.0
    return f"{minutes:.1f}m"


def _age_minutes(now: datetime, ts_value: Any) -> float | None:
    ts = _parse_ts(ts_value)
    if not ts:
        return None
    delta = now - ts
    return max(0.0, delta.total_seconds() / 60.0)


def _build_health_issues(
    now: datetime,
    latest_by_key: dict[tuple[str, str], dict[str, Any]],
    source_health_by_source: dict[str, dict[str, Any]],
    queue_rows: list[dict[str, Any]],
    sources: list[str],
) -> list[str]:
    issues: list[str] = []

    for source in sources:
        for run_type in RUN_TYPES:
            latest = latest_by_key.get((source, run_type))
            if not latest:
                issues.append(f"{source}/{run_type}: no run found in lookback window")
                continue

            status = (latest.get("status") or "").lower()
            if status == "error":
                issues.append(f"{source}/{run_type}: latest run failed")
            elif status == "running":
                age = _age_minutes(now, latest.get("started_at"))
                if age is not None and age > STALE_AFTER_MINUTES.get(run_type, 60):
                    issues.append(f"{source}/{run_type}: running for {age:.1f}m")
            elif status == "success":
                age = _age_minutes(now, latest.get("started_at"))
                if age is not None and age > STALE_AFTER_MINUTES.get(run_type, 60):
                    issues.append(f"{source}/{run_type}: stale ({age:.1f}m since start)")

                staged_count = _to_int(latest.get("staged_count"), 0)
                parse_fail_count = _to_int(latest.get("parse_fail_count"), 0)
                if staged_count > 0:
                    ratio = parse_fail_count / staged_count
                    if ratio > 0.10:
                        issues.append(f"{source}/{run_type}: parse fail ratio {ratio:.1%}")

                queue_oldest = _to_float(latest.get("queue_oldest_age_minutes"), 0.0)
                if queue_oldest > 60:
                    issues.append(f"{source}/{run_type}: queue oldest age {queue_oldest:.1f}m")

        health = source_health_by_source.get(source)
        if health:
            unhealthy_runs = _to_int(health.get("consecutive_unhealthy_runs"), 0)
            if unhealthy_runs > 0:
                issues.append(f"{source}: {unhealthy_runs} consecutive unhealthy runs")
            miss_candidates = _to_int(health.get("consecutive_miss_candidates"), 0)
            if miss_candidates > 0:
                issues.append(f"{source}: {miss_candidates} consecutive miss candidate runs")

    processing_rows = [row for row in queue_rows if (row.get("status") or "").lower() == "processing"]
    if len(processing_rows) > 100:
        issues.append(f"detail queue has {len(processing_rows)} processing rows")

    return issues


def _fetch_runs(client: Any, lookback_hours: int, query_limit: int) -> list[dict[str, Any]]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=lookback_hours)).isoformat()
    response = (
        client.table("scrape_runs_v3")
        .select(RUN_COLUMNS)
        .gte("started_at", cutoff)
        .order("started_at", desc=True)
        .limit(query_limit)
        .execute()
    )
    return response.data or []


def _fetch_source_health(client: Any) -> dict[str, dict[str, Any]]:
    try:
        response = client.table("scrape_source_health_v3").select(SOURCE_HEALTH_COLUMNS).execute()
    except Exception:
        return {}
    rows = response.data or []
    return {str(row.get("source")): row for row in rows if row.get("source")}


def _fetch_queue_rows(client: Any, limit: int = 5000) -> list[dict[str, Any]]:
    response = (
        client.table("scrape_detail_queue_v3")
        .select(QUEUE_COLUMNS)
        .in_("status", ["pending", "processing"])
        .limit(limit)
        .execute()
    )
    return response.data or []


def _summarize(rows: list[dict[str, Any]], source_health_by_source: dict[str, dict[str, Any]], queue_rows: list[dict[str, Any]]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    latest_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    sources_seen: set[str] = set()
    runs_24h: list[dict[str, Any]] = []
    running_rows: list[dict[str, Any]] = []
    failure_rows: list[dict[str, Any]] = []
    event_totals = {"inserted": 0, "price_changed": 0, "sold": 0, "removed": 0, "unchanged": 0}

    for row in rows:
        source = str(row.get("source") or "")
        run_type = str(row.get("run_type") or "")
        status = str(row.get("status") or "").lower()
        started = _parse_ts(row.get("started_at"))
        if source:
            sources_seen.add(source)
        if source and run_type:
            latest_by_key.setdefault((source, run_type), row)

        if status == "running":
            running_rows.append(row)
        elif status == "error":
            failure_rows.append(row)

        if started and started >= cutoff_24h:
            runs_24h.append(row)
            event_totals["inserted"] += _to_int(row.get("inserted_count"))
            event_totals["price_changed"] += _to_int(row.get("price_changed_count"))
            event_totals["sold"] += _to_int(row.get("sold_count"))
            event_totals["removed"] += _to_int(row.get("removed_count"))
            event_totals["unchanged"] += _to_int(row.get("unchanged_count"))

    sources = list(DEFAULT_SOURCES)
    for source in sorted(sources_seen):
        if source not in sources:
            sources.append(source)

    success_24h = [row for row in runs_24h if str(row.get("status") or "").lower() == "success"]
    total_requests_24h = sum(_to_int(row.get("external_request_count")) for row in success_24h)
    total_writes_24h = sum(_to_int(row.get("supabase_write_count")) for row in success_24h)
    avg_duration_24h = 0.0
    if success_24h:
        avg_duration_24h = sum(_to_float(row.get("run_duration_seconds")) for row in success_24h) / len(success_24h)

    run_type_stats: dict[str, dict[str, Any]] = {}
    for run_type in RUN_TYPES:
        subset = [row for row in runs_24h if row.get("run_type") == run_type]
        subset_success = [row for row in subset if str(row.get("status") or "").lower() == "success"]
        run_type_stats[run_type] = {
            "runs": len(subset),
            "success": len(subset_success),
            "requests": sum(_to_int(row.get("external_request_count")) for row in subset_success),
            "avg_duration_seconds": (
                sum(_to_float(row.get("run_duration_seconds")) for row in subset_success) / len(subset_success)
                if subset_success
                else 0.0
            ),
        }

    queue_by_source: dict[str, dict[str, Any]] = {}
    for row in queue_rows:
        source = str(row.get("source") or "")
        if not source:
            continue
        group = queue_by_source.setdefault(source, {"pending": 0, "processing": 0, "oldest_pending_minutes": None})
        status = str(row.get("status") or "").lower()
        if status in ("pending", "processing"):
            group[status] += 1
        if status == "pending":
            age = _age_minutes(now, row.get("created_at"))
            oldest = group["oldest_pending_minutes"]
            if age is not None and (oldest is None or age > oldest):
                group["oldest_pending_minutes"] = age

    issues = _build_health_issues(now, latest_by_key, source_health_by_source, queue_rows, sources)

    return {
        "generated_at": now.isoformat(),
        "sources": sources,
        "latest_by_key": latest_by_key,
        "running_rows": running_rows,
        "failure_rows": failure_rows[:20],
        "total_runs_24h": len(runs_24h),
        "success_runs_24h": len(success_24h),
        "total_requests_24h": total_requests_24h,
        "total_writes_24h": total_writes_24h,
        "avg_duration_24h": avg_duration_24h,
        "event_totals_24h": event_totals,
        "run_type_stats_24h": run_type_stats,
        "source_health_by_source": source_health_by_source,
        "queue_by_source": queue_by_source,
        "issues": issues,
    }


def _status_class(status: str) -> str:
    normalized = status.lower().strip()
    if normalized == "success":
        return "ok"
    if normalized in {"error", "failed"}:
        return "bad"
    if normalized == "running":
        return "warn"
    return "muted"


def _render_page(snapshot: dict[str, Any], refresh_seconds: int) -> str:
    generated_at = _fmt_dt(snapshot.get("generated_at"))
    total_runs_24h = _to_int(snapshot.get("total_runs_24h"))
    success_runs_24h = _to_int(snapshot.get("success_runs_24h"))
    success_rate_24h = (100.0 * success_runs_24h / total_runs_24h) if total_runs_24h > 0 else 0.0
    issues = snapshot.get("issues") or []

    lines: list[str] = []
    for source in snapshot.get("sources", []):
        queue_summary = snapshot["queue_by_source"].get(source, {})
        source_health = snapshot["source_health_by_source"].get(source, {})
        for run_type in RUN_TYPES:
            latest = snapshot["latest_by_key"].get((source, run_type), {})
            status = str(latest.get("status") or "missing")
            age = _age_minutes(datetime.now(timezone.utc), latest.get("started_at"))
            age_text = "-" if age is None else f"{age:.1f}m"
            parse_fail = _to_int(latest.get("parse_fail_count"))
            staged = _to_int(latest.get("staged_count"))
            parse_ratio = (parse_fail / staged) if staged > 0 else 0.0
            lines.append(
                "<tr>"
                f"<td>{html.escape(source)}</td>"
                f"<td>{html.escape(run_type)}</td>"
                f"<td><span class='pill {_status_class(status)}'>{html.escape(status)}</span></td>"
                f"<td>{_fmt_dt(latest.get('started_at'))}</td>"
                f"<td>{_fmt_duration_seconds(latest.get('run_duration_seconds'))}</td>"
                f"<td>{age_text}</td>"
                f"<td>{_to_int(latest.get('external_request_count'))}</td>"
                f"<td>{_to_int(latest.get('detail_fetch_count'))}</td>"
                f"<td>{parse_fail}/{staged} ({parse_ratio:.1%})</td>"
                f"<td>{_fmt_minutes(latest.get('queue_oldest_age_minutes'))}</td>"
                f"<td>{_to_int(queue_summary.get('pending'))}/{_to_int(queue_summary.get('processing'))}</td>"
                f"<td>{_to_int(source_health.get('consecutive_unhealthy_runs'))}</td>"
                "</tr>"
            )

    failure_lines = []
    for row in snapshot.get("failure_rows", []):
        failure_lines.append(
            "<tr>"
            f"<td>{html.escape(str(row.get('source') or '-'))}</td>"
            f"<td>{html.escape(str(row.get('run_type') or '-'))}</td>"
            f"<td>{_fmt_dt(row.get('started_at'))}</td>"
            f"<td>{html.escape(str(row.get('error_message') or '-')[:240])}</td>"
            "</tr>"
        )

    running_lines = []
    for row in snapshot.get("running_rows", []):
        running_age = _age_minutes(datetime.now(timezone.utc), row.get("started_at"))
        running_age_text = "-" if running_age is None else f"{running_age:.1f}m"
        running_lines.append(
            "<tr>"
            f"<td>{html.escape(str(row.get('source') or '-'))}</td>"
            f"<td>{html.escape(str(row.get('run_type') or '-'))}</td>"
            f"<td>{_fmt_dt(row.get('started_at'))}</td>"
            f"<td>{running_age_text}</td>"
            "</tr>"
        )

    run_type_lines = []
    for run_type in RUN_TYPES:
        stats = snapshot["run_type_stats_24h"].get(run_type, {})
        run_type_lines.append(
            "<tr>"
            f"<td>{html.escape(run_type)}</td>"
            f"<td>{_to_int(stats.get('runs'))}</td>"
            f"<td>{_to_int(stats.get('success'))}</td>"
            f"<td>{_to_int(stats.get('requests'))}</td>"
            f"<td>{_fmt_duration_seconds(stats.get('avg_duration_seconds'))}</td>"
            "</tr>"
        )

    issue_items = "".join(f"<li>{html.escape(issue)}</li>" for issue in issues[:20]) or "<li>No issues detected.</li>"
    running_section = "".join(running_lines) or "<tr><td colspan='4'>No currently running rows.</td></tr>"
    failure_section = "".join(failure_lines) or "<tr><td colspan='4'>No recent failures.</td></tr>"
    run_matrix_section = "".join(lines)
    run_type_section = "".join(run_type_lines)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="refresh" content="{refresh_seconds}" />
  <title>Scraper V3 Local Dashboard</title>
  <style>
    :root {{
      --bg: #f4f6f8;
      --card: #ffffff;
      --text: #1b1f24;
      --muted: #586171;
      --ok: #1f8f4e;
      --warn: #9a6700;
      --bad: #b42318;
      --border: #d7dde4;
    }}
    body {{
      margin: 0;
      padding: 20px;
      background: var(--bg);
      color: var(--text);
      font-family: "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.4;
    }}
    .layout {{
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      max-width: 1400px;
      margin: 0 auto;
    }}
    .card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
    }}
    h1, h2 {{
      margin: 0 0 10px;
      font-size: 16px;
    }}
    .meta {{
      color: var(--muted);
      margin-bottom: 10px;
    }}
    .kpis {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }}
    .kpi {{
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: #fafbfc;
    }}
    .kpi .label {{
      color: var(--muted);
      margin-bottom: 6px;
    }}
    .kpi .value {{
      font-size: 18px;
      font-weight: 700;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
    }}
    th, td {{
      border-bottom: 1px solid var(--border);
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }}
    th {{
      color: var(--muted);
      font-weight: 600;
      font-size: 12px;
      background: #fafbfc;
      position: sticky;
      top: 0;
    }}
    .table-wrap {{
      overflow: auto;
      max-height: 420px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }}
    .pill {{
      display: inline-block;
      border-radius: 999px;
      padding: 2px 7px;
      border: 1px solid var(--border);
      font-weight: 700;
      font-size: 11px;
    }}
    .pill.ok {{ color: var(--ok); border-color: #9dd9b4; background: #edf9f1; }}
    .pill.warn {{ color: var(--warn); border-color: #f3cf86; background: #fff7e6; }}
    .pill.bad {{ color: var(--bad); border-color: #f4b4ae; background: #fff0ee; }}
    .pill.muted {{ color: var(--muted); }}
    ul {{
      margin: 0;
      padding-left: 20px;
    }}
    .split {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 16px;
    }}
  </style>
</head>
<body>
  <div class="layout">
    <section class="card">
      <h1>Scraper V3 Local Dashboard</h1>
      <div class="meta">Generated: {html.escape(generated_at)} | Auto-refresh: {refresh_seconds}s</div>
      <div class="kpis">
        <div class="kpi"><div class="label">24h Runs</div><div class="value">{total_runs_24h}</div></div>
        <div class="kpi"><div class="label">24h Success Rate</div><div class="value">{success_rate_24h:.1f}%</div></div>
        <div class="kpi"><div class="label">24h External Requests</div><div class="value">{_to_int(snapshot.get("total_requests_24h"))}</div></div>
        <div class="kpi"><div class="label">24h Supabase Writes</div><div class="value">{_to_int(snapshot.get("total_writes_24h"))}</div></div>
        <div class="kpi"><div class="label">24h Avg Run Duration</div><div class="value">{_fmt_duration_seconds(snapshot.get("avg_duration_24h"))}</div></div>
        <div class="kpi"><div class="label">Health Issues</div><div class="value">{len(issues)}</div></div>
      </div>
    </section>

    <section class="card">
      <h2>Event Counts (24h)</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">inserted</div><div class="value">{_to_int(snapshot["event_totals_24h"]["inserted"])}</div></div>
        <div class="kpi"><div class="label">price_changed</div><div class="value">{_to_int(snapshot["event_totals_24h"]["price_changed"])}</div></div>
        <div class="kpi"><div class="label">sold</div><div class="value">{_to_int(snapshot["event_totals_24h"]["sold"])}</div></div>
        <div class="kpi"><div class="label">removed</div><div class="value">{_to_int(snapshot["event_totals_24h"]["removed"])}</div></div>
        <div class="kpi"><div class="label">unchanged</div><div class="value">{_to_int(snapshot["event_totals_24h"]["unchanged"])}</div></div>
      </div>
    </section>

    <section class="card">
      <h2>Issues</h2>
      <ul>{issue_items}</ul>
    </section>

    <section class="card">
      <h2>Run-Type Summary (24h)</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Run Type</th><th>Runs</th><th>Success</th><th>Requests</th><th>Avg Duration</th></tr></thead>
          <tbody>{run_type_section}</tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Latest Run Matrix</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th><th>Run Type</th><th>Status</th><th>Started</th><th>Duration</th><th>Age</th>
              <th>Req</th><th>Detail</th><th>Parse</th><th>Queue Age</th><th>Queue P/Pr</th><th>Unhealthy Runs</th>
            </tr>
          </thead>
          <tbody>{run_matrix_section}</tbody>
        </table>
      </div>
    </section>

    <div class="split">
      <section class="card">
        <h2>Running</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Source</th><th>Run Type</th><th>Started</th><th>Running For</th></tr></thead>
            <tbody>{running_section}</tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>Recent Failures</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Source</th><th>Run Type</th><th>Started</th><th>Error</th></tr></thead>
            <tbody>{failure_section}</tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</body>
</html>"""


def _build_snapshot(client: Any, lookback_hours: int, query_limit: int) -> dict[str, Any]:
    runs = _fetch_runs(client, lookback_hours=lookback_hours, query_limit=query_limit)
    source_health = _fetch_source_health(client)
    queue_rows = _fetch_queue_rows(client, limit=query_limit * 2)
    return _summarize(runs, source_health_by_source=source_health, queue_rows=queue_rows)


def _make_handler(client: Any, lookback_hours: int, query_limit: int, refresh_seconds: int):
    class DashboardHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == "/healthz":
                payload = b"ok\n"
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return

            if parsed.path == "/api/snapshot":
                try:
                    snapshot = _build_snapshot(client, lookback_hours=lookback_hours, query_limit=query_limit)
                    payload = json.dumps(snapshot, default=str).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                except Exception as exc:  # pragma: no cover - defensive path
                    payload = json.dumps({"error": str(exc)}).encode("utf-8")
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                return

            try:
                snapshot = _build_snapshot(client, lookback_hours=lookback_hours, query_limit=query_limit)
                page = _render_page(snapshot, refresh_seconds=refresh_seconds).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(page)))
                self.end_headers()
                self.wfile.write(page)
            except Exception as exc:  # pragma: no cover - defensive path
                payload = f"dashboard render failed: {exc}\n".encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            return

    return DashboardHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="Local dashboard for scraper V3 operational health.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--lookback-hours", type=int, default=48)
    parser.add_argument("--query-limit", type=int, default=1000)
    parser.add_argument("--refresh-seconds", type=int, default=20)
    args = parser.parse_args()

    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in environment/.env.")

    client = create_client(supabase_url, supabase_key)
    handler_cls = _make_handler(
        client=client,
        lookback_hours=max(1, args.lookback_hours),
        query_limit=max(50, args.query_limit),
        refresh_seconds=max(5, args.refresh_seconds),
    )

    server = ThreadingHTTPServer((args.host, args.port), handler_cls)
    print(f"V3 dashboard listening on http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
