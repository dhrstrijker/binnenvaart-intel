import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PREMIUM_SUBSCRIPTION_STATUSES } from "@/lib/polar/subscriptionSync";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  // Check auth - user must be logged in and premium
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  // Check premium status
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .in("status", [...PREMIUM_SUBSCRIPTION_STATUSES])
    .gt("current_period_end", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Premium vereist" }, { status: 403 });
  }

  const admin = getAdminClient();

  // Fetch stats in parallel
  const [sentRes, eventsRes, activeRes, verifiedRes] = await Promise.all([
    admin.from("notification_history").select("*", { count: "exact", head: true }),
    admin.from("notification_events").select("event_type"),
    admin.from("notification_subscribers").select("*", { count: "exact", head: true }).eq("active", true),
    admin.from("notification_subscribers").select("*", { count: "exact", head: true }).eq("active", true).not("verified_at", "is", null),
  ]);

  const events = eventsRes.data ?? [];

  return NextResponse.json({
    totalSent: sentRes.count ?? 0,
    totalDelivered: events.filter(e => e.event_type === "delivered").length,
    totalOpened: events.filter(e => e.event_type === "opened").length,
    totalClicked: events.filter(e => e.event_type === "clicked").length,
    totalBounced: events.filter(e => e.event_type === "bounced").length,
    activeSubscribers: activeRes.count ?? 0,
    verifiedSubscribers: verifiedRes.count ?? 0,
  });
}
