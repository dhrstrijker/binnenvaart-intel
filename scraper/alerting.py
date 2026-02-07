"""Scraper alerting module: circuit breaker + email alerts.

Prevents mark_removed() from mass-deleting vessels on partial scraper
failures, and sends email alerts when scrapers fail.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

import resend
from dotenv import load_dotenv

from db import supabase

load_dotenv()

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
ALERT_EMAIL = os.environ.get("ALERT_EMAIL", "")
FROM_ADDRESS = "onboarding@resend.dev"

# Threshold: if vessel count drops below this fraction of the
# historical average, block mark_removed().
CIRCUIT_BREAKER_THRESHOLD = 0.5


def get_historical_avg(source: str, days: int = 7) -> int:
    """Get average vessel count from recent successful scraper runs."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        resp = (
            supabase.table("scraper_runs")
            .select("vessel_count")
            .eq("source", source)
            .eq("status", "success")
            .gte("created_at", cutoff)
            .execute()
        )
        counts = [r["vessel_count"] for r in (resp.data or [])]
        return int(sum(counts) / len(counts)) if counts else 0
    except Exception:
        logger.exception("Failed to query historical avg for %s", source)
        # Fail safe: return -1 to signal unknown (caller should block)
        return -1


def should_allow_mark_removed(source: str, current_count: int) -> bool:
    """Circuit breaker: returns False if current_count is suspiciously low.

    Rules:
    - If historical query failed (avg == -1): BLOCK (fail safe)
    - If historical_avg == 0 (new source, no history): allow
    - If current_count < historical_avg * CIRCUIT_BREAKER_THRESHOLD: BLOCK
    - Otherwise: allow
    """
    avg = get_historical_avg(source)
    if avg == -1:
        logger.warning(
            "Could not fetch baseline for %s — blocking mark_removed (fail safe)",
            source,
        )
        return False
    if avg == 0:
        return True
    return current_count >= avg * CIRCUIT_BREAKER_THRESHOLD


def log_scraper_run(source: str, vessel_count: int, status: str, error_message: str | None = None) -> None:
    """Log a scraper run to the scraper_runs table (fire-and-forget)."""
    try:
        row = {"source": source, "vessel_count": vessel_count, "status": status}
        if error_message:
            row["error_message"] = error_message[:500]
        supabase.table("scraper_runs").insert(row).execute()
    except Exception:
        logger.exception("Failed to log scraper run for %s", source)


def _has_open_alert(source: str, error_type: str) -> bool:
    """Check if an open alert already exists for this source + error_type."""
    try:
        resp = (
            supabase.table("scraper_alerts")
            .select("id")
            .eq("source", source)
            .eq("error_type", error_type)
            .eq("status", "open")
            .execute()
        )
        return bool(resp.data)
    except Exception:
        logger.exception("Failed to check open alerts for %s", source)
        return False


def _log_alert_to_db(source: str, error_type: str, error_message: str,
                     expected_count: int | None = None, actual_count: int | None = None) -> None:
    """Store alert in scraper_alerts table (fire-and-forget, deduplicated)."""
    if _has_open_alert(source, error_type):
        logger.info("Open alert already exists for %s/%s — skipping DB insert", source, error_type)
        return
    try:
        supabase.table("scraper_alerts").insert({
            "source": source,
            "error_type": error_type,
            "error_message": error_message[:500] if error_message else None,
            "expected_count": expected_count,
            "actual_count": actual_count,
            "status": "open",
        }).execute()
    except Exception:
        logger.exception("Failed to log alert to DB for %s", source)


def resolve_open_alerts(source: str) -> None:
    """Auto-resolve open alerts for a source and send recovery email."""
    try:
        resp = (
            supabase.table("scraper_alerts")
            .select("id, error_type")
            .eq("source", source)
            .eq("status", "open")
            .execute()
        )
        if not resp.data:
            return

        now = datetime.now(timezone.utc).isoformat()
        for alert in resp.data:
            supabase.table("scraper_alerts").update({
                "status": "resolved",
                "resolved_at": now,
            }).eq("id", alert["id"]).execute()

        logger.info("Resolved %d open alert(s) for %s", len(resp.data), source)
        _send_recovery_email(source)
    except Exception:
        logger.exception("Failed to resolve open alerts for %s", source)


def _send_recovery_email(source: str) -> None:
    """Send a recovery notification email."""
    subject = f"Scraper recovered: {source}"
    body = _build_alert_html(
        title=f"{source} scraper recovered",
        severity="success",
        details=[
            f"The <strong>{source}</strong> scraper is working normally again.",
            "Previously open alerts have been auto-resolved.",
        ],
    )
    send_email_alert(subject, body)


def send_email_alert(subject: str, body: str) -> None:
    """Send an alert email via Resend API."""
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not set, skipping alert email")
        return
    if not ALERT_EMAIL:
        logger.warning("ALERT_EMAIL not set, skipping alert email")
        return
    try:
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": ALERT_EMAIL,
            "subject": subject,
            "html": body,
        })
        logger.info("Alert email sent: %s", subject)
    except Exception:
        logger.exception("Failed to send alert email: %s", subject)


def alert_scraper_failure(scraper_name: str, error_msg: str) -> None:
    """Called when a scraper crashes with an exception."""
    subject = f"Scraper crashed: {scraper_name}"
    body = _build_alert_html(
        title=f"{scraper_name} scraper crashed",
        severity="critical",
        details=[
            f"<strong>Error:</strong> {error_msg[:300]}",
            "<code>mark_removed()</code> was <strong>not called</strong> (total=0, safe).",
        ],
        causes=[
            "Network timeout or connection refused",
            "API endpoint changed",
            "HTML structure changed causing parser exception",
            "Dependency or import error",
        ],
    )
    send_email_alert(subject, body)
    _log_alert_to_db(scraper_name.lower(), "exception", error_msg, actual_count=0)


def alert_zero_vessels(scraper_name: str, expected_count: int) -> None:
    """Called when a scraper returns 0 vessels."""
    subject = f"Scraper returned 0 vessels: {scraper_name}"
    body = _build_alert_html(
        title=f"{scraper_name} returned 0 vessels",
        severity="critical",
        details=[
            f"<strong>Expected:</strong> ~{expected_count} vessels" if expected_count > 0
            else "<strong>Expected:</strong> unknown (no baseline)",
            "<strong>Actual:</strong> 0 vessels",
            "<code>mark_removed()</code> was <strong>not called</strong> (total=0, safe).",
        ],
        causes=[
            "HTML structure changed (CSS selectors broken)",
            "API response format changed",
            "Broker website is down or returning empty page",
            "Authentication or rate-limiting applied",
        ],
    )
    send_email_alert(subject, body)
    _log_alert_to_db(scraper_name.lower(), "zero_vessels",
                     f"{scraper_name} returned 0 vessels (expected ~{expected_count})",
                     expected_count=expected_count, actual_count=0)


def alert_vessel_count_drop(scraper_name: str, current: int, expected: int) -> None:
    """Called when vessel count drops >50% from baseline (circuit breaker triggered)."""
    subject = f"Circuit breaker triggered: {scraper_name} ({current}/{expected} vessels)"
    body = _build_alert_html(
        title=f"{scraper_name}: circuit breaker triggered",
        severity="critical",
        details=[
            f"<strong>Expected:</strong> ~{expected} vessels",
            f"<strong>Actual:</strong> {current} vessels ({current * 100 // expected}% of expected)",
            "<code>mark_removed()</code> was <strong>BLOCKED</strong> to prevent false 'Verkocht' emails.",
            "No vessels were marked as removed. No customer notifications were sent.",
        ],
        causes=[
            "Pagination broke (only first page loaded)",
            "Partial HTML loaded (CDN/network issue)",
            "New vessel type not recognized in parser",
            "Rate-limiting caused partial results",
        ],
    )
    send_email_alert(subject, body)
    _log_alert_to_db(scraper_name.lower(), "count_drop",
                     f"{scraper_name} returned {current} vessels (expected ~{expected}), mark_removed blocked",
                     expected_count=expected, actual_count=current)


def _build_alert_html(title: str, severity: str, details: list[str],
                      causes: list[str] | None = None) -> str:
    """Build HTML email body for an alert."""
    color_map = {"critical": "#ef4444", "warning": "#d97706", "success": "#059669"}
    color = color_map.get(severity, "#6b7280")
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M UTC")

    details_html = "".join(f"<li style='margin:4px 0;'>{d}</li>" for d in details)

    causes_html = ""
    if causes:
        causes_items = "".join(f"<li style='margin:4px 0;'>{c}</li>" for c in causes)
        causes_html = f"""
        <div style="margin-top:16px;">
          <h3 style="margin:0 0 8px;color:#475569;font-size:14px;">Possible causes:</h3>
          <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;">{causes_items}</ul>
        </div>"""

    return f"""
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:{color};border-radius:12px 12px 0 0;padding:20px 24px;">
      <h1 style="margin:0;color:#ffffff;font-size:18px;">{title}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;">{now}</p>
    </div>
    <div style="background:#ffffff;padding:20px 24px;border-radius:0 0 12px 12px;">
      <ul style="margin:0;padding-left:20px;color:#0f172a;font-size:14px;line-height:1.8;">
        {details_html}
      </ul>
      {causes_html}
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">
          Automated alert from Navisio scraper pipeline
        </p>
      </div>
    </div>
  </div>
</body>
</html>"""
