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

  const { data, error } = await getAdminClient()
    .from("notification_subscribers")
    .update({ verified_at: new Date().toISOString() })
    .eq("verification_token", token)
    .is("verified_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return new NextResponse(htmlPage("Ongeldige of verlopen verificatielink."), {
      status: 400,
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
