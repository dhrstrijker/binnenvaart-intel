import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return new NextResponse(htmlPage("Ongeldige of verlopen verificatielink."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const admin = getAdminClient();

  // Look up the subscriber by token (unverified only)
  const { data: subscriber } = await admin
    .from("notification_subscribers")
    .select("id, updated_at")
    .eq("verification_token", token)
    .is("verified_at", null)
    .maybeSingle();

  if (!subscriber) {
    return new NextResponse(htmlPage("Ongeldige of verlopen verificatielink."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Enforce 24-hour token expiration
  if (subscriber.updated_at) {
    const tokenAge = Date.now() - new Date(subscriber.updated_at).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (tokenAge > twentyFourHours) {
      return new NextResponse(
        htmlPage("Deze verificatielink is verlopen. Vraag een nieuwe aan."),
        {
          status: 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }
  }

  // Mark as verified
  const { data, error } = await admin
    .from("notification_subscribers")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", subscriber.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return new NextResponse(htmlPage("Er ging iets mis bij het verifiëren."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new NextResponse(
    htmlPage("Je e-mailadres is geverifieerd! Je ontvangt nu meldingen bij wijzigingen op de binnenvaartmarkt."),
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function htmlPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Navisio - Verificatie</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
    .card { background: white; border-radius: 1rem; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); text-align: center; max-width: 400px; }
    h1 { font-size: 1.125rem; margin: 0 0 0.5rem; }
    p { color: #64748b; font-size: 0.875rem; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Navisio</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}
