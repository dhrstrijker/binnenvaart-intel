import { Webhooks } from "@polar-sh/nextjs";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  onSubscriptionCreated: async (payload) => {
    const sub = payload.data;
    const metadata = sub.metadata as Record<string, string> | undefined;
    const userId = metadata?.user_id;
    if (!userId) return;

    const admin = getAdminClient();
    await admin.from("subscriptions").upsert({
      id: sub.id,
      user_id: userId,
      polar_customer_id: sub.customerId,
      product_id: sub.productId,
      status: sub.status,
      amount: sub.amount,
      currency: sub.currency,
      recurring_interval: sub.recurringInterval,
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      created_at: sub.createdAt,
      updated_at: new Date().toISOString(),
    });

    // Link polar_customer_id to user profile
    if (sub.customerId) {
      await admin
        .from("profiles")
        .update({ polar_customer_id: sub.customerId, updated_at: new Date().toISOString() })
        .eq("id", userId);
    }
  },

  onSubscriptionActive: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    await admin
      .from("subscriptions")
      .update({
        status: sub.status,
        current_period_start: sub.currentPeriodStart,
        current_period_end: sub.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  },

  onSubscriptionUpdated: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    await admin
      .from("subscriptions")
      .update({
        status: sub.status,
        amount: sub.amount,
        currency: sub.currency,
        recurring_interval: sub.recurringInterval,
        current_period_start: sub.currentPeriodStart,
        current_period_end: sub.currentPeriodEnd,
        cancel_at_period_end: sub.cancelAtPeriodEnd,
        canceled_at: sub.canceledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  },

  onSubscriptionCanceled: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: sub.cancelAtPeriodEnd,
        canceled_at: sub.canceledAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  },

  onSubscriptionRevoked: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    await admin
      .from("subscriptions")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  },

  onCheckoutUpdated: async (payload) => {
    const checkout = payload.data;
    if (checkout.status !== "succeeded") return;

    const metadata = checkout.metadata as Record<string, string> | undefined;
    const userId = metadata?.user_id;
    if (!userId || !checkout.customerId) return;

    const admin = getAdminClient();
    await admin
      .from("profiles")
      .update({
        polar_customer_id: checkout.customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  },
});
