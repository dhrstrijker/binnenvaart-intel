export const PREMIUM_SUBSCRIPTION_STATUSES = ["active", "trialing", "canceled"] as const;

type MetadataValue = string | number | boolean | null;

function metadataStringValue(
  metadata: Record<string, MetadataValue> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

export interface PolarSubscriptionLike {
  id: string;
  customerId: string | null;
  productId: string | null;
  status: string;
  amount: number;
  currency: string;
  recurringInterval: string | null;
  currentPeriodStart: Date | string | null;
  currentPeriodEnd: Date | string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | string | null;
  createdAt: Date | string;
  metadata?: Record<string, MetadataValue>;
  customer?: {
    externalId?: string | null;
  };
}

export interface PolarCheckoutLike {
  customerId: string | null;
  metadata?: Record<string, MetadataValue>;
  customerMetadata?: Record<string, MetadataValue>;
  externalCustomerId?: string | null;
  customerExternalId?: string | null;
}

export function resolveUserIdFromSubscription(
  subscription: PolarSubscriptionLike,
  profileUserIdByPolarCustomerId?: string | null,
): string | null {
  return (
    metadataStringValue(subscription.metadata, "user_id") ??
    (subscription.customer?.externalId?.trim() || null) ??
    (profileUserIdByPolarCustomerId?.trim() || null)
  );
}

export function resolveUserIdFromCheckout(checkout: PolarCheckoutLike): string | null {
  return (
    metadataStringValue(checkout.metadata, "user_id") ??
    metadataStringValue(checkout.customerMetadata, "user_id") ??
    (checkout.externalCustomerId?.trim() || null) ??
    (checkout.customerExternalId?.trim() || null)
  );
}

export function buildSubscriptionPatch(subscription: PolarSubscriptionLike, nowIso: string) {
  return {
    polar_customer_id: subscription.customerId,
    product_id: subscription.productId,
    status: subscription.status,
    amount: subscription.amount,
    currency: subscription.currency,
    recurring_interval: subscription.recurringInterval,
    current_period_start: toIsoString(subscription.currentPeriodStart),
    current_period_end: toIsoString(subscription.currentPeriodEnd),
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    canceled_at: toIsoString(subscription.canceledAt),
    updated_at: nowIso,
  };
}

export function buildSubscriptionUpsert(
  subscription: PolarSubscriptionLike,
  userId: string,
  nowIso: string,
) {
  return {
    id: subscription.id,
    user_id: userId,
    ...buildSubscriptionPatch(subscription, nowIso),
    created_at: toIsoString(subscription.createdAt) ?? nowIso,
  };
}
