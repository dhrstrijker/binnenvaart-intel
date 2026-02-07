import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType: string = body?.type;

    // Map Resend event types to our internal event types
    const eventTypeMap: Record<string, string> = {
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "complained",
    };

    const mappedEventType = eventTypeMap[eventType];

    // Handle bounce/complaint subscriber deactivation
    if (eventType === "email.bounced" || eventType === "email.complained") {
      const email: string | undefined =
        body?.data?.to?.[0] ?? body?.data?.email;

      if (email) {
        await getAdminClient()
          .from("notification_subscribers")
          .update({ active: false })
          .eq("email", email);
      }
    }

    // Track all delivery events
    if (mappedEventType) {
      const resendMessageId = body?.data?.email_id;
      const occurredAt = body?.data?.created_at || new Date().toISOString();

      if (resendMessageId) {
        const adminClient = getAdminClient();

        // Try to find the notification_history_id by matching resend_message_id
        const { data: historyRecord } = await adminClient
          .from("notification_history")
          .select("id")
          .eq("resend_message_id", resendMessageId)
          .maybeSingle();

        // Insert event into notification_events
        await adminClient.from("notification_events").insert({
          notification_history_id: historyRecord?.id || null,
          resend_message_id: resendMessageId,
          event_type: mappedEventType,
          occurred_at: occurredAt,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true });
  }
}
