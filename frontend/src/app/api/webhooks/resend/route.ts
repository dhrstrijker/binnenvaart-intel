import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const payload = await request.text();
    const headers = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };

    let body: Record<string, unknown>;
    try {
      const wh = new Webhook(webhookSecret);
      body = wh.verify(payload, headers) as Record<string, unknown>;
    } catch (err) {
      console.error("[resend-webhook] Signature verification failed:", err);
      return new Response("Invalid signature", { status: 401 });
    }

    const eventType: string = (body as { type?: string })?.type ?? "";

    // Map Resend event types to our internal event types
    const eventTypeMap: Record<string, string> = {
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "complained",
    };

    const mappedEventType = eventTypeMap[eventType];

    const data = body?.data as Record<string, unknown> | undefined;

    // Handle bounce/complaint subscriber deactivation
    if (eventType === "email.bounced" || eventType === "email.complained") {
      const toArray = data?.to as string[] | undefined;
      const email: string | undefined =
        toArray?.[0] ?? (data?.email as string | undefined);

      if (email) {
        await getAdminClient()
          .from("notification_subscribers")
          .update({ active: false })
          .eq("email", email);
      }
    }

    // Track all delivery events
    if (mappedEventType) {
      const resendMessageId = data?.email_id as string | undefined;
      const occurredAt =
        (data?.created_at as string | undefined) || new Date().toISOString();

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
