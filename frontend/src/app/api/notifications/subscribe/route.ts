import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Ongeldig e-mailadres." },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // Check if already subscribed and verified
    const { data: existing } = await admin
      .from("notification_subscribers")
      .select("id, verified_at, updated_at")
      .eq("email", email)
      .maybeSingle();

    if (existing?.verified_at) {
      return NextResponse.json({
        message: "Dit e-mailadres ontvangt al meldingen.",
        already_subscribed: true,
      });
    }

    // Rate limit: skip if updated less than 2 minutes ago
    if (existing?.updated_at) {
      const updatedAt = new Date(existing.updated_at).getTime();
      const twoMinAgo = Date.now() - 2 * 60 * 1000;
      if (updatedAt > twoMinAgo) {
        return NextResponse.json({
          message:
            "We hebben al een verificatielink gestuurd. Controleer je inbox.",
        });
      }
    }

    const verificationToken = crypto.randomUUID();
    const unsubscribeToken = crypto.randomUUID();

    // Upsert subscriber
    const { error: upsertError } = await admin
      .from("notification_subscribers")
      .upsert(
        {
          email,
          verification_token: verificationToken,
          unsubscribe_token: unsubscribeToken,
          active: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

    if (upsertError) {
      console.error("[subscribe] Upsert error:", upsertError);
      return NextResponse.json(
        { error: "Er ging iets mis. Probeer het later opnieuw." },
        { status: 500 }
      );
    }

    // Send verification email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://navisio.nl";
      const verifyUrl = `${siteUrl}/api/verify-email?token=${verificationToken}`;

      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: "Navisio <meldingen@navisio.nl>",
        to: email,
        subject: "Bevestig je e-mailadres - Navisio",
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
            <h2 style="font-size: 18px; color: #1e293b; margin: 0 0 16px;">Bevestig je e-mailadres</h2>
            <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 24px;">
              Klik op de knop hieronder om meldingen over prijswijzigingen en nieuwe schepen te activeren.
            </p>
            <a href="${verifyUrl}" style="display: inline-block; background: #0891b2; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
              E-mailadres bevestigen
            </a>
            <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; line-height: 1.5;">
              Als je dit niet hebt aangevraagd, kun je deze e-mail negeren.
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({
      message: "Verificatielink verstuurd.",
    });
  } catch {
    return NextResponse.json(
      { error: "Er ging iets mis. Probeer het later opnieuw." },
      { status: 500 }
    );
  }
}
