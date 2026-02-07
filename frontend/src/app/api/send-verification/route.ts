import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildVerificationHtml(verificationUrl: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:-0.03em;">NAVISIO</h1>
      <p style="margin:4px 0 0;color:#06b6d4;font-size:13px;">Scheepsmarkt Intelligence</p>
    </div>
    <div style="background:#ffffff;padding:32px 24px;text-align:center;">
      <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">Bevestig uw e-mailadres</h2>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Klik op de onderstaande knop om uw e-mailadres te bevestigen en meldingen te activeren.
      </p>
      <a href="${escapeHtml(verificationUrl)}"
         style="display:inline-block;background:#06b6d4;color:#ffffff;
                font-weight:600;font-size:15px;padding:12px 32px;
                border-radius:8px;text-decoration:none;">
        E-mailadres bevestigen
      </a>
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">
        Deze link is 24 uur geldig. Heeft u zich niet aangemeld? Dan kunt u deze e-mail negeren.
      </p>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">
        &copy; Navisio &mdash; Scheepsmarkt Intelligence
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    const { email, verificationToken } = await request.json();

    if (!email || !verificationToken) {
      return NextResponse.json(
        { error: "Email and verificationToken are required" },
        { status: 400 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://navisio.nl");
    const verificationUrl = `${siteUrl}/api/verify-email?token=${encodeURIComponent(verificationToken)}`;

    await getResend().emails.send({
      from: "Navisio <notifications@navisio.nl>",
      to: email,
      subject: "Bevestig uw e-mailadres voor Navisio meldingen",
      html: buildVerificationHtml(verificationUrl),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
