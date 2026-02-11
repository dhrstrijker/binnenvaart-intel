import { Webhooks } from "@polar-sh/nextjs";
import { createClient } from "@supabase/supabase-js";
import {
  buildSubscriptionPatch,
  buildSubscriptionUpsert,
  resolveUserIdFromCheckout,
  resolveUserIdFromSubscription,
  type PolarSubscriptionLike,
} from "@/lib/polar/subscriptionSync";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function findUserIdByPolarCustomerId(
  admin: ReturnType<typeof getAdminClient>,
  polarCustomerId: string | null,
): Promise<string | null> {
  if (!polarCustomerId) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("polar_customer_id", polarCustomerId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data?.id ?? null;
}

async function linkProfileCustomer(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  polarCustomerId: string | null,
) {
  if (!polarCustomerId) return;

  const { error } = await admin
    .from("profiles")
    .update({
      polar_customer_id: polarCustomerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

async function syncSubscription(
  admin: ReturnType<typeof getAdminClient>,
  subscription: PolarSubscriptionLike,
): Promise<string | null> {
  const nowIso = new Date().toISOString();

  const { data: updatedRows, error: updateError } = await admin
    .from("subscriptions")
    .update(buildSubscriptionPatch(subscription, nowIso))
    .eq("id", subscription.id)
    .select("id,user_id");
  if (updateError) {
    throw updateError;
  }

  if ((updatedRows?.length ?? 0) > 0) {
    return updatedRows?.[0]?.user_id ?? null;
  }

  const profileUserId = await findUserIdByPolarCustomerId(admin, subscription.customerId);
  const userId = resolveUserIdFromSubscription(subscription, profileUserId);
  if (!userId) {
    console.error("[polar-webhook] Unable to resolve user_id for subscription", {
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
    });
    throw new Error("Unable to resolve user_id for subscription");
  }

  const { data: upserted, error: upsertError } = await admin
    .from("subscriptions")
    .upsert(buildSubscriptionUpsert(subscription, userId, nowIso))
    .select("id,user_id")
    .single();
  if (upsertError) {
    throw upsertError;
  }

  return upserted?.user_id ?? userId;
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  onSubscriptionCreated: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    try {
      const userId = await syncSubscription(admin, sub);
      if (userId) {
        await linkProfileCustomer(admin, userId, sub.customerId);
      }
    } catch (error) {
      console.error("[polar-webhook] onSubscriptionCreated sync failed", error);
      throw error;
    }
  },

  onSubscriptionActive: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    try {
      const userId = await syncSubscription(admin, sub);
      if (userId) {
        await linkProfileCustomer(admin, userId, sub.customerId);
      }
    } catch (error) {
      console.error("[polar-webhook] onSubscriptionActive sync failed", error);
      throw error;
    }
  },

  onSubscriptionUpdated: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    try {
      const userId = await syncSubscription(admin, sub);
      if (userId) {
        await linkProfileCustomer(admin, userId, sub.customerId);
      }
    } catch (error) {
      console.error("[polar-webhook] onSubscriptionUpdated sync failed", error);
      throw error;
    }
  },

  onSubscriptionCanceled: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    try {
      const userId = await syncSubscription(admin, sub);
      if (userId) {
        await linkProfileCustomer(admin, userId, sub.customerId);
      }
    } catch (error) {
      console.error("[polar-webhook] onSubscriptionCanceled sync failed", error);
      throw error;
    }
  },

  onSubscriptionRevoked: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    try {
      const userId = await syncSubscription(admin, sub);
      if (userId) {
        await linkProfileCustomer(admin, userId, sub.customerId);
      }
    } catch (error) {
      console.error("[polar-webhook] onSubscriptionRevoked sync failed", error);
      throw error;
    }
  },

  onSubscriptionUncanceled: async (payload) => {
    const sub = payload.data;
    const admin = getAdminClient();
    try {
      const userId = await syncSubscription(admin, sub);
      if (userId) {
        await linkProfileCustomer(admin, userId, sub.customerId);
      }
    } catch (error) {
      console.error("[polar-webhook] onSubscriptionUncanceled sync failed", error);
      throw error;
    }
  },

  onCheckoutUpdated: async (payload) => {
    const checkout = payload.data;
    if (checkout.status !== "succeeded") return;

    const userId = resolveUserIdFromCheckout(checkout);
    if (!userId || !checkout.customerId) {
      console.error("[polar-webhook] onCheckoutUpdated: missing user_id or customerId", {
        checkoutId: checkout.id,
      });
      return;
    }

    const admin = getAdminClient();
    try {
      await linkProfileCustomer(admin, userId, checkout.customerId);
    } catch (error) {
      console.error("[polar-webhook] onCheckoutUpdated profile update failed", error);
      throw error;
    }
  },
});
