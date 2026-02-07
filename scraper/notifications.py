"""Email notification module using Resend API.

Sends alerts to subscribers when the scraper detects vessel changes
(new listings, price changes). Called from main.py after scraping.
"""

import logging
import os
from datetime import datetime, timezone
from html import escape
from urllib.parse import quote, urlparse

import resend
from dotenv import load_dotenv

from db import (
    supabase,
    get_verified_subscribers,
    get_user_watchlist_vessel_ids,
    save_notification_history,
)

load_dotenv()

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")

FROM_ADDRESS = os.environ.get("FROM_ADDRESS", "Navisio <notifications@navisio.nl>")

SAFE_URL_SCHEMES = {"http", "https", ""}


def _safe_url(url: str) -> str:
    """Validate URL protocol - block javascript: and other dangerous schemes."""
    try:
        parsed = urlparse(url)
        if parsed.scheme.lower() not in SAFE_URL_SCHEMES:
            return "#"
    except Exception:
        return "#"
    return url

# Maps change kind to the per-vessel watchlist flag that controls it
KIND_TO_WATCHLIST_FLAG = {
    "price_changed": "notify_price_change",
    "removed": "notify_status_change",
    "sold": "notify_status_change",
}


def _get_active_subscribers() -> list[str]:
    """Fetch all active subscriber email addresses."""
    result = (
        supabase.table("notification_subscribers")
        .select("email")
        .eq("active", True)
        .execute()
    )
    return [row["email"] for row in (result.data or [])]


def _format_price(price) -> str:
    """Format a price as Dutch EUR string."""
    if price is None:
        return "Prijs op aanvraag"
    return f"\u20ac {price:,.0f}".replace(",", ".")


def _build_vessel_row(change: dict) -> str:
    """Build an HTML table row for a single vessel change."""
    kind = change["kind"]
    vessel = change["vessel"]
    name = escape(vessel.get("name", "Onbekend"))
    url = escape(_safe_url(vessel.get("url", "#")), quote=True)
    source = escape(vessel.get("source", ""))

    if kind == "inserted":
        badge = '<span style="background:#059669;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">Nieuw</span>'
        price_cell = _format_price(vessel.get("price"))
    elif kind == "removed":
        badge = '<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">Verkocht</span>'
        price_cell = _format_price(vessel.get("price"))
    else:
        old_price = change.get("old_price")
        new_price = change.get("new_price")
        badge = '<span style="background:#d97706;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">Prijswijziging</span>'
        price_cell = f'{_format_price(old_price)} &rarr; {_format_price(new_price)}'

    specs = []
    if vessel.get("type"):
        specs.append(escape(vessel["type"]))
    if vessel.get("length_m"):
        specs.append(f'{vessel["length_m"]}m')
    specs_str = " &middot; ".join(specs) if specs else ""

    return f"""
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:12px 8px;">
        <a href="{url}" style="color:#0f172a;font-weight:600;text-decoration:none;">{name}</a>
        <br><span style="color:#94a3b8;font-size:12px;">{source} {specs_str}</span>
      </td>
      <td style="padding:12px 8px;text-align:center;">{badge}</td>
      <td style="padding:12px 8px;text-align:right;font-weight:600;color:#0f172a;">{price_cell}</td>
    </tr>"""


def _build_summary_html(stats: dict, changes: list[dict]) -> str:
    """Build the full HTML email body."""
    total_changes = len(changes)
    new_count = sum(1 for c in changes if c["kind"] == "inserted")
    price_count = sum(1 for c in changes if c["kind"] == "price_changed")
    removed_count = sum(1 for c in changes if c["kind"] == "removed")
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M UTC")

    rows = "\n".join(_build_vessel_row(c) for c in changes[:50])

    return f"""
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:-0.03em;">NAVISIO</h1>
      <p style="margin:4px 0 0;color:#06b6d4;font-size:13px;">Scheepsmarkt Intelligence</p>
    </div>

    <!-- Stats -->
    <div style="background:#ffffff;padding:20px 24px;border-bottom:1px solid #e2e8f0;">
      <p style="margin:0 0 12px;color:#475569;font-size:14px;">Scrape voltooid op {now}</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:24px;font-weight:700;color:#0f172a;">{total_changes}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Wijzigingen</div>
          </td>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:24px;font-weight:700;color:#059669;">{new_count}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Nieuw</div>
          </td>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:24px;font-weight:700;color:#d97706;">{price_count}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Prijswijzigingen</div>
          </td>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:24px;font-weight:700;color:#ef4444;">{removed_count}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Verkocht</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Changes table -->
    <div style="background:#ffffff;padding:0 24px 20px;">
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr style="border-bottom:2px solid #e2e8f0;">
            <th style="padding:8px;text-align:left;font-size:12px;color:#94a3b8;text-transform:uppercase;">Schip</th>
            <th style="padding:8px;text-align:center;font-size:12px;color:#94a3b8;text-transform:uppercase;">Status</th>
            <th style="padding:8px;text-align:right;font-size:12px;color:#94a3b8;text-transform:uppercase;">Prijs</th>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
      {"<p style='color:#94a3b8;font-size:12px;text-align:center;margin-top:12px;'>En nog " + str(total_changes - 50) + " andere wijzigingen...</p>" if total_changes > 50 else ""}
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">
        U ontvangt dit bericht omdat u zich heeft aangemeld voor Navisio alerts.
      </p>
    </div>
  </div>
</body>
</html>"""


def send_summary_email(stats: dict, changes: list[dict]) -> None:
    """Send a summary email to all active subscribers.

    Args:
        stats: Combined scrape stats with keys total, inserted, price_changed, unchanged.
        changes: List of change dicts with keys: kind, vessel, and optionally old_price/new_price.
    """
    if not changes:
        logger.info("Geen wijzigingen, geen e-mail verstuurd.")
        return

    if not resend.api_key:
        logger.warning("RESEND_API_KEY niet ingesteld, overgeslagen.")
        return

    subscribers = _get_active_subscribers()
    if not subscribers:
        logger.info("Geen actieve abonnees gevonden.")
        return

    count = len(changes)
    subject = f"Navisio: {count} wijziging{'en' if count != 1 else ''} gedetecteerd"
    html = _build_summary_html(stats, changes)

    for email in subscribers:
        try:
            resend.Emails.send(
                {
                    "from": FROM_ADDRESS,
                    "to": email,
                    "subject": subject,
                    "html": html,
                }
            )
            logger.info("E-mail verstuurd naar %s", email)
        except Exception:
            logger.exception("Fout bij verzenden naar %s", email)


def filter_changes_for_user(subscriber: dict, all_changes: list[dict]) -> list[dict]:
    """Filter changes to only vessels in user's watchlist, respecting preferences.

    Three filter layers:
    1. Vessel must be on user's watchlist
    2. Change kind must be allowed by global preferences
    3. Per-vessel notification flag must be enabled for that change kind
    """
    watchlist = get_user_watchlist_vessel_ids(subscriber["user_id"])
    if not watchlist:
        return []

    prefs = subscriber.get("preferences") or {}
    allowed_types = prefs.get("types", ["new", "price_change", "removed"])

    type_map = {
        "inserted": "new",
        "price_changed": "price_change",
        "removed": "removed",
        "sold": "removed",
    }

    filtered = []
    for change in all_changes:
        vessel_id = change.get("vessel", {}).get("id")
        kind = change.get("kind", "")
        pref_type = type_map.get(kind, kind)

        if vessel_id not in watchlist:
            continue
        if pref_type not in allowed_types:
            continue
        flag_name = KIND_TO_WATCHLIST_FLAG.get(kind)
        if flag_name and not watchlist[vessel_id].get(flag_name, True):
            continue
        filtered.append(change)

    return filtered


def build_personalized_subject(user_changes: list[dict]) -> str:
    """Dynamic subject line based on change types."""
    new_count = sum(1 for c in user_changes if c["kind"] == "inserted")
    price_count = sum(1 for c in user_changes if c["kind"] == "price_changed")
    removed_count = sum(1 for c in user_changes if c["kind"] in ("removed", "sold"))

    parts = []
    if price_count:
        parts.append(f"{price_count} prijswijziging{'en' if price_count != 1 else ''}")
    if new_count:
        parts.append(f"{new_count} nieuw{'e' if new_count != 1 else ''} {'schepen' if new_count != 1 else 'schip'}")
    if removed_count:
        parts.append(f"{removed_count} verkocht")

    summary = ", ".join(parts) if parts else "Wijzigingen"
    return f"Navisio: {summary} in uw watchlist"


def build_personalized_email(subscriber: dict, user_changes: list[dict]) -> str:
    """Build personalized HTML email showing only watchlist changes."""
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M UTC")
    unsubscribe_token = subscriber.get("unsubscribe_token", "")

    price_changes = [c for c in user_changes if c["kind"] == "price_changed"]
    new_vessels = [c for c in user_changes if c["kind"] == "inserted"]
    removed_vessels = [c for c in user_changes if c["kind"] in ("removed", "sold")]

    sections = ""

    if price_changes:
        rows = "\n".join(_build_vessel_row(c) for c in price_changes)
        sections += f"""
        <div style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:#d97706;font-size:14px;text-transform:uppercase;">
            Prijswijzigingen ({len(price_changes)})
          </h3>
          <table style="width:100%;border-collapse:collapse;">{rows}</table>
        </div>"""

    if new_vessels:
        rows = "\n".join(_build_vessel_row(c) for c in new_vessels)
        sections += f"""
        <div style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:#059669;font-size:14px;text-transform:uppercase;">
            Nieuwe schepen ({len(new_vessels)})
          </h3>
          <table style="width:100%;border-collapse:collapse;">{rows}</table>
        </div>"""

    if removed_vessels:
        rows = "\n".join(_build_vessel_row(c) for c in removed_vessels)
        sections += f"""
        <div style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:#ef4444;font-size:14px;text-transform:uppercase;">
            Verkocht / Verwijderd ({len(removed_vessels)})
          </h3>
          <table style="width:100%;border-collapse:collapse;">{rows}</table>
        </div>"""

    return f"""
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:-0.03em;">NAVISIO</h1>
      <p style="margin:4px 0 0;color:#06b6d4;font-size:13px;">Watchlist Wijzigingen</p>
    </div>

    <!-- Content -->
    <div style="background:#ffffff;padding:20px 24px;">
      <p style="margin:0 0 16px;color:#475569;font-size:14px;">
        Er zijn {len(user_changes)} wijziging{"en" if len(user_changes) != 1 else ""} gedetecteerd
        in uw watchlist op {now}.
      </p>
      {sections}
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">
        U ontvangt dit bericht omdat u watchlist-meldingen heeft ingeschakeld.
        <br><a href="https://navisio.nl/api/unsubscribe?token={escape(quote(unsubscribe_token), quote=True)}"
          style="color:#06b6d4;text-decoration:underline;">Uitschrijven</a>
      </p>
    </div>
  </div>
</body>
</html>"""


def build_verification_html(verification_url: str) -> str:
    """HTML email for double opt-in verification."""
    return f"""
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:-0.03em;">NAVISIO</h1>
      <p style="margin:4px 0 0;color:#06b6d4;font-size:13px;">Scheepsmarkt Intelligence</p>
    </div>

    <!-- Content -->
    <div style="background:#ffffff;padding:32px 24px;text-align:center;">
      <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">Bevestig uw e-mailadres</h2>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Klik op de onderstaande knop om uw e-mailadres te bevestigen
        en meldingen te activeren.
      </p>
      <a href="{escape(verification_url, quote=True)}"
         style="display:inline-block;background:#06b6d4;color:#ffffff;
                font-weight:600;font-size:15px;padding:12px 32px;
                border-radius:8px;text-decoration:none;">
        E-mailadres bevestigen
      </a>
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">
        Deze link is 24 uur geldig. Heeft u zich niet aangemeld?
        Dan kunt u deze e-mail negeren.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">
        &copy; Navisio &mdash; Scheepsmarkt Intelligence
      </p>
    </div>
  </div>
</body>
</html>"""


def send_verification_email(email: str, verification_token: str) -> None:
    """Send double opt-in verification email."""
    if not resend.api_key:
        logger.warning("RESEND_API_KEY niet ingesteld, verificatie-e-mail overgeslagen.")
        return

    verification_url = f"https://navisio.nl/api/verify-email?token={quote(verification_token)}"
    try:
        resend.Emails.send(
            {
                "from": FROM_ADDRESS,
                "to": email,
                "subject": "Bevestig uw e-mailadres voor Navisio meldingen",
                "html": build_verification_html(verification_url),
            }
        )
        logger.info("Verificatie-e-mail verstuurd naar %s", email)
    except Exception:
        logger.exception("Fout bij verzenden verificatie naar %s", email)


def send_personalized_notifications(stats: dict, changes: list[dict]) -> None:
    """Send personalized notifications to verified subscribers with watchlists.

    Subscribers with a user_id get personalized emails filtered to their
    watchlist. Legacy subscribers (no user_id) receive the generic summary.
    """
    if not changes:
        logger.info("Geen wijzigingen, geen e-mails verstuurd.")
        return

    if not resend.api_key:
        logger.warning("RESEND_API_KEY niet ingesteld, overgeslagen.")
        return

    subscribers = get_verified_subscribers()
    if not subscribers:
        logger.info("Geen geverifieerde abonnees gevonden.")
        return

    personalized_subs = [s for s in subscribers if s.get("user_id")]
    legacy_subs = [s for s in subscribers if not s.get("user_id")]

    # Personalized emails for subscribers with user accounts
    for sub in personalized_subs:
        user_changes = filter_changes_for_user(sub, changes)
        if not user_changes:
            continue

        html = build_personalized_email(sub, user_changes)
        subject = build_personalized_subject(user_changes)

        try:
            result = resend.Emails.send(
                {
                    "from": FROM_ADDRESS,
                    "to": sub["email"],
                    "subject": subject,
                    "html": html,
                    "headers": {
                        "List-Unsubscribe": f"<https://navisio.nl/api/unsubscribe?token={quote(sub['unsubscribe_token'])}>"
                    },
                }
            )
            message_id = result.get("id") if isinstance(result, dict) else None
            save_notification_history(
                sub["user_id"],
                [c["vessel"]["id"] for c in user_changes if "vessel" in c],
                "watchlist",
                message_id,
            )
            logger.info("Gepersonaliseerde e-mail verstuurd naar %s", sub["email"])
        except Exception:
            logger.exception("Fout bij verzenden naar %s", sub["email"])

    # Legacy generic email for subscribers without user accounts
    if legacy_subs and changes:
        logger.info(
            "%d legacy abonnees krijgen generieke samenvatting.", len(legacy_subs)
        )
        send_summary_email(stats, changes)


def get_saved_search_matches(search: dict, all_changes: list[dict]) -> list[dict]:
    """Filter changes matching saved search criteria."""
    filters = search.get("filters") or {}
    matches = list(all_changes)

    if filters.get("search"):
        q = filters["search"].lower()
        matches = [c for c in matches if q in c.get("vessel", {}).get("name", "").lower()]

    if filters.get("type"):
        matches = [c for c in matches if c.get("vessel", {}).get("type") == filters["type"]]

    if filters.get("source"):
        matches = [c for c in matches if c.get("vessel", {}).get("source") == filters["source"]]

    if filters.get("minPrice"):
        min_price = float(filters["minPrice"])
        matches = [c for c in matches if (c.get("vessel", {}).get("price") or 0) >= min_price]

    if filters.get("maxPrice"):
        max_price = float(filters["maxPrice"])
        matches = [c for c in matches if (c.get("vessel", {}).get("price") or float("inf")) <= max_price]

    if filters.get("minLength"):
        min_len = float(filters["minLength"])
        matches = [c for c in matches if (c.get("vessel", {}).get("length_m") or 0) >= min_len]

    if filters.get("maxLength"):
        max_len = float(filters["maxLength"])
        matches = [c for c in matches if (c.get("vessel", {}).get("length_m") or float("inf")) <= max_len]

    if filters.get("minWidth"):
        min_w = float(filters["minWidth"])
        matches = [c for c in matches if (c.get("vessel", {}).get("width_m") or 0) >= min_w]

    if filters.get("maxWidth"):
        max_w = float(filters["maxWidth"])
        matches = [c for c in matches if (c.get("vessel", {}).get("width_m") or float("inf")) <= max_w]

    if filters.get("minBuildYear"):
        min_by = int(filters["minBuildYear"])
        matches = [c for c in matches if (c.get("vessel", {}).get("build_year") or 0) >= min_by]

    if filters.get("maxBuildYear"):
        max_by = int(filters["maxBuildYear"])
        matches = [c for c in matches if (c.get("vessel", {}).get("build_year") or 9999) <= max_by]

    if filters.get("minTonnage"):
        min_t = float(filters["minTonnage"])
        matches = [c for c in matches if (c.get("vessel", {}).get("tonnage") or 0) >= min_t]

    if filters.get("maxTonnage"):
        max_t = float(filters["maxTonnage"])
        matches = [c for c in matches if (c.get("vessel", {}).get("tonnage") or float("inf")) <= max_t]

    return matches


def build_digest_email(subscriber: dict, all_matches: list[dict], label: str) -> str:
    """Build digest HTML email grouping watchlist + saved search results."""
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M UTC")
    unsubscribe_token = subscriber.get("unsubscribe_token", "")

    price_changes = [c for c in all_matches if c["kind"] == "price_changed"]
    new_vessels = [c for c in all_matches if c["kind"] == "inserted"]
    removed_vessels = [c for c in all_matches if c["kind"] == "removed"]

    sections = ""

    if price_changes:
        rows = "\n".join(_build_vessel_row(c) for c in price_changes)
        sections += f"""
        <div style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:#d97706;font-size:14px;text-transform:uppercase;">
            Prijswijzigingen ({len(price_changes)})
          </h3>
          <table style="width:100%;border-collapse:collapse;">{rows}</table>
        </div>"""

    if new_vessels:
        rows = "\n".join(_build_vessel_row(c) for c in new_vessels)
        sections += f"""
        <div style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:#059669;font-size:14px;text-transform:uppercase;">
            Nieuwe schepen ({len(new_vessels)})
          </h3>
          <table style="width:100%;border-collapse:collapse;">{rows}</table>
        </div>"""

    if removed_vessels:
        rows = "\n".join(_build_vessel_row(c) for c in removed_vessels)
        sections += f"""
        <div style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:#ef4444;font-size:14px;text-transform:uppercase;">
            Verkocht / Verwijderd ({len(removed_vessels)})
          </h3>
          <table style="width:100%;border-collapse:collapse;">{rows}</table>
        </div>"""

    return f"""
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:-0.03em;">NAVISIO</h1>
      <p style="margin:4px 0 0;color:#06b6d4;font-size:13px;">{escape(label)} Samenvatting</p>
    </div>

    <!-- Content -->
    <div style="background:#ffffff;padding:20px 24px;">
      <p style="margin:0 0 16px;color:#475569;font-size:14px;">
        Er zijn {len(all_matches)} wijziging{"en" if len(all_matches) != 1 else ""} gedetecteerd
        in uw watchlist en opgeslagen zoekopdrachten op {now}.
      </p>
      {sections}
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">
        U ontvangt dit bericht omdat u {escape(label.lower())} samenvattingen heeft ingeschakeld.
        <br><a href="https://navisio.nl/api/unsubscribe?token={escape(quote(unsubscribe_token), quote=True)}"
          style="color:#06b6d4;text-decoration:underline;">Uitschrijven</a>
      </p>
    </div>
  </div>
</body>
</html>"""


def send_digest(frequency: str) -> None:
    """Send digest emails (daily or weekly) to subscribers with that frequency preference.

    Combines watchlist changes + saved search matches into one email per user.
    """
    if not resend.api_key:
        logger.warning("RESEND_API_KEY niet ingesteld, digest overgeslagen.")
        return

    from db import get_subscribers_with_frequency, get_user_saved_searches, get_user_watchlist_vessel_ids, get_changes_since, save_notification_history
    from datetime import timedelta

    cutoff_days = 1 if frequency == "daily" else 7
    cutoff = (datetime.now(timezone.utc) - timedelta(days=cutoff_days)).isoformat()

    recent_changes = get_changes_since(cutoff)
    if not recent_changes:
        logger.info("Geen recente wijzigingen voor %s digest.", frequency)
        return

    subscribers = get_subscribers_with_frequency(frequency)
    if not subscribers:
        logger.info("Geen abonnees voor %s digest.", frequency)
        return

    for sub in subscribers:
        user_matches = []
        seen_vessel_ids = set()

        # Watchlist matches
        watchlist = get_user_watchlist_vessel_ids(sub["user_id"])
        for change in recent_changes:
            vid = change.get("vessel", {}).get("id")
            if vid not in watchlist or vid in seen_vessel_ids:
                continue
            kind = change.get("kind", "")
            flag_name = KIND_TO_WATCHLIST_FLAG.get(kind)
            if flag_name and not watchlist[vid].get(flag_name, True):
                continue
            user_matches.append(change)
            seen_vessel_ids.add(vid)

        # Saved search matches
        searches = get_user_saved_searches(sub["user_id"], frequency=frequency)
        for search in searches:
            search_matches = get_saved_search_matches(search, recent_changes)
            for match in search_matches:
                vid = match.get("vessel", {}).get("id")
                if vid not in seen_vessel_ids:
                    user_matches.append(match)
                    seen_vessel_ids.add(vid)

        if not user_matches:
            continue

        label = "Dagelijkse" if frequency == "daily" else "Wekelijkse"
        html = build_digest_email(sub, user_matches, label)
        subject = f"Navisio: {label} samenvatting — {len(user_matches)} wijziging{'en' if len(user_matches) != 1 else ''}"

        try:
            result = resend.Emails.send({
                "from": FROM_ADDRESS,
                "to": sub["email"],
                "subject": subject,
                "html": html,
                "headers": {
                    "List-Unsubscribe": f"<https://navisio.nl/api/unsubscribe?token={quote(sub['unsubscribe_token'])}>"
                }
            })
            message_id = result.get("id") if isinstance(result, dict) else None
            save_notification_history(
                sub["user_id"],
                [c["vessel"]["id"] for c in user_matches if "vessel" in c],
                f"{frequency}_digest",
                message_id,
            )
            logger.info("%s digest verstuurd naar %s", label, sub["email"])
        except Exception:
            logger.exception("Fout bij %s digest naar %s", frequency, sub["email"])
