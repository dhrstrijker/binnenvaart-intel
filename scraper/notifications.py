"""Email notification module using Resend API.

Sends alerts to subscribers when the scraper detects vessel changes
(new listings, price changes). Called from main.py after scraping.
"""

import os
from datetime import datetime, timezone

import resend
from dotenv import load_dotenv

from db import supabase

load_dotenv()

resend.api_key = os.environ.get("RESEND_API_KEY", "")

FROM_ADDRESS = "onboarding@resend.dev"


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
    name = vessel.get("name", "Onbekend")
    url = vessel.get("url", "#")
    source = vessel.get("source", "")

    if kind == "inserted":
        badge = '<span style="background:#059669;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">Nieuw</span>'
        price_cell = _format_price(vessel.get("price"))
    else:
        old_price = change.get("old_price")
        new_price = change.get("new_price")
        badge = '<span style="background:#d97706;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">Prijswijziging</span>'
        price_cell = f'{_format_price(old_price)} &rarr; {_format_price(new_price)}'

    specs = []
    if vessel.get("type"):
        specs.append(vessel["type"])
    if vessel.get("length_m"):
        specs.append(f'{vessel["length_m"]}m')
    specs_str = " &middot; ".join(specs) if specs else ""

    return f"""
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:12px 8px;">
        <a href="{url}" style="color:#1e3a5f;font-weight:600;text-decoration:none;">{name}</a>
        <br><span style="color:#94a3b8;font-size:12px;">{source} {specs_str}</span>
      </td>
      <td style="padding:12px 8px;text-align:center;">{badge}</td>
      <td style="padding:12px 8px;text-align:right;font-weight:600;color:#1e3a5f;">{price_cell}</td>
    </tr>"""


def _build_summary_html(stats: dict, changes: list[dict]) -> str:
    """Build the full HTML email body."""
    total_changes = len(changes)
    new_count = sum(1 for c in changes if c["kind"] == "inserted")
    price_count = sum(1 for c in changes if c["kind"] == "price_changed")
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M UTC")

    rows = "\n".join(_build_vessel_row(c) for c in changes[:50])

    return f"""
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:#1e3a5f;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;">Binnenvaart Intel</h1>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Scheepvaart marktplaats monitor</p>
    </div>

    <!-- Stats -->
    <div style="background:#ffffff;padding:20px 24px;border-bottom:1px solid #e2e8f0;">
      <p style="margin:0 0 12px;color:#475569;font-size:14px;">Scrape voltooid op {now}</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="text-align:center;padding:8px;">
            <div style="font-size:24px;font-weight:700;color:#1e3a5f;">{total_changes}</div>
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
            <div style="font-size:24px;font-weight:700;color:#475569;">{stats.get('total', 0)}</div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Totaal verwerkt</div>
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
        U ontvangt dit bericht omdat u zich heeft aangemeld voor Binnenvaart Intel alerts.
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
        print("Notifications: geen wijzigingen, geen e-mail verstuurd.")
        return

    if not resend.api_key:
        print("Notifications: RESEND_API_KEY niet ingesteld, overgeslagen.")
        return

    subscribers = _get_active_subscribers()
    if not subscribers:
        print("Notifications: geen actieve abonnees gevonden.")
        return

    count = len(changes)
    subject = f"Binnenvaart Intel: {count} wijziging{'en' if count != 1 else ''} gedetecteerd"
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
            print(f"Notifications: e-mail verstuurd naar {email}")
        except Exception as e:
            print(f"Notifications: fout bij verzenden naar {email}: {e}")
