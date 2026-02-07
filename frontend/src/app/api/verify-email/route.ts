import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token ontbreekt" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("notification_subscribers")
    .update({ verified_at: new Date().toISOString() })
    .eq("verification_token", token)
    .is("verified_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Ongeldig of verlopen token" },
      { status: 400 }
    );
  }

  return NextResponse.redirect(new URL("/account?verified=true", request.url));
}
