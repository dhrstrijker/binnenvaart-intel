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
    if (!userId) {
      console.error("[polar-webhook] onSubscriptionCreated: missing user_id in metadata", { subId: sub.id, customerId: sub.customerId });
      throw new Error("Missing user_id in subscription metadata");
    }

    const admin = getAdminClient();
    const { error } = await admin.from("subscriptions").upsert({
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
    if (error) {
      console.error("[polar-webhook] onSubscriptionCreated upsert failed", error);
      throw error;
    }

    // Link polar_customer_id to user profile
    if (sub.customerId) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({ polar_customer_id: sub.customerId, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (profileError) {
        console.error("[polar-webhook] onSubscriptionCreated profile update failed", profileError);
        throw profileError;
      }
    }
  },

  onSubscriptionActive: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: sub.status,
        current_period_start: sub.currentPeriodStart,
        current_period_end: sub.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    if (error) {
      console.error("[polar-webhook] onSubscriptionActive update failed", error);
      throw error;
    }
  },

  onSubscriptionUpdated: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    const { error } = await admin
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
    if (error) {
      console.error("[polar-webhook] onSubscriptionUpdated update failed", error);
      throw error;
    }
  },

  onSubscriptionCanceled: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: sub.cancelAtPeriodEnd,
        canceled_at: sub.canceledAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    if (error) {
      console.error("[polar-webhook] onSubscriptionCanceled update failed", error);
      throw error;
    }
  },

  onSubscriptionRevoked: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    if (error) {
      console.error("[polar-webhook] onSubscriptionRevoked update failed", error);
      throw error;
    }
  },

  onCheckoutUpdated: async (payload) => {
    const checkout = payload.data;
    if (checkout.status !== "succeeded") return;

    const metadata = checkout.metadata as Record<string, string> | undefined;
    const userId = metadata?.user_id;
    if (!userId || !checkout.customerId) {
      console.error("[polar-webhook] onCheckoutUpdated: missing user_id or customerId", { checkoutId: checkout.id });
      return;
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({
        polar_customer_id: checkout.customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      console.error("[polar-webhook] onCheckoutUpdated profile update failed", error);
      throw error;
    }
  },
});
