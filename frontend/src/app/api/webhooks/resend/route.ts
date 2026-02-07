import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType: string = body?.type;

    if (eventType === "email.bounced" || eventType === "email.complained") {
      const email: string | undefined =
        body?.data?.to?.[0] ?? body?.data?.email;

      if (email) {
        await supabaseAdmin
          .from("notification_subscribers")
          .update({ active: false })
          .eq("email", email);
      }
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true });
  }
}
