import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
    }

    const admin = getAdminClient();

    const { error } = await admin.from("notification_subscribers").upsert(
      {
        email: user.email,
        user_id: user.id,
        verified_at: new Date().toISOString(),
        active: true,
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("[subscribe-auth] Upsert error:", error);
      return NextResponse.json(
        { error: "Er ging iets mis." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Er ging iets mis." },
      { status: 500 }
    );
  }
}
