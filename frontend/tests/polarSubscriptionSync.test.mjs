import test from "node:test";
import assert from "node:assert/strict";
import {
  PREMIUM_SUBSCRIPTION_STATUSES,
  buildSubscriptionPatch,
  buildSubscriptionUpsert,
  resolveUserIdFromCheckout,
  resolveUserIdFromSubscription,
} from "../src/lib/polar/subscriptionSync.ts";

test("premium statuses include active, trialing, canceled", () => {
  assert.deepEqual(
    [...PREMIUM_SUBSCRIPTION_STATUSES],
    ["active", "trialing", "canceled"],
  );
});

test("resolveUserIdFromSubscription prefers metadata user_id", () => {
  const userId = resolveUserIdFromSubscription({
    id: "sub_1",
    customerId: "cus_1",
    productId: "prod_1",
    status: "active",
    amount: 1900,
    currency: "eur",
    recurringInterval: "month",
    currentPeriodStart: "2026-02-01T00:00:00.000Z",
    currentPeriodEnd: "2026-03-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    metadata: { user_id: "user_meta" },
    customer: { externalId: "user_external" },
  }, "user_profile");

  assert.equal(userId, "user_meta");
});

test("resolveUserIdFromSubscription falls back to customer external id then profile mapping", () => {
  const fromExternal = resolveUserIdFromSubscription({
    id: "sub_1",
    customerId: "cus_1",
    productId: "prod_1",
    status: "active",
    amount: 1900,
    currency: "eur",
    recurringInterval: "month",
    currentPeriodStart: "2026-02-01T00:00:00.000Z",
    currentPeriodEnd: "2026-03-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    customer: { externalId: "user_external" },
  }, "user_profile");

  assert.equal(fromExternal, "user_external");

  const fromProfile = resolveUserIdFromSubscription({
    id: "sub_2",
    customerId: "cus_2",
    productId: "prod_1",
    status: "active",
    amount: 1900,
    currency: "eur",
    recurringInterval: "month",
    currentPeriodStart: "2026-02-01T00:00:00.000Z",
    currentPeriodEnd: "2026-03-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
  }, "user_profile");

  assert.equal(fromProfile, "user_profile");
});

test("resolveUserIdFromCheckout checks metadata, customer metadata, and external ids", () => {
  assert.equal(
    resolveUserIdFromCheckout({
      customerId: "cus_1",
      metadata: { user_id: "user_meta" },
      customerMetadata: { user_id: "user_customer_meta" },
      externalCustomerId: "user_external",
      customerExternalId: "user_legacy_external",
    }),
    "user_meta",
  );

  assert.equal(
    resolveUserIdFromCheckout({
      customerId: "cus_1",
      customerMetadata: { user_id: "user_customer_meta" },
      externalCustomerId: "user_external",
      customerExternalId: "user_legacy_external",
    }),
    "user_customer_meta",
  );

  assert.equal(
    resolveUserIdFromCheckout({
      customerId: "cus_1",
      externalCustomerId: "user_external",
      customerExternalId: "user_legacy_external",
    }),
    "user_external",
  );
});

test("buildSubscriptionPatch preserves cancellation semantics and normalizes dates", () => {
  const nowIso = "2026-02-11T00:00:00.000Z";
  const patch = buildSubscriptionPatch({
    id: "sub_1",
    customerId: "cus_1",
    productId: "prod_1",
    status: "canceled",
    amount: 1900,
    currency: "eur",
    recurringInterval: "month",
    currentPeriodStart: new Date("2026-02-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-03-01T00:00:00.000Z"),
    cancelAtPeriodEnd: true,
    canceledAt: new Date("2026-02-10T00:00:00.000Z"),
    createdAt: "2026-02-01T00:00:00.000Z",
  }, nowIso);

  assert.equal(patch.status, "canceled");
  assert.equal(patch.cancel_at_period_end, true);
  assert.equal(patch.current_period_end, "2026-03-01T00:00:00.000Z");
  assert.equal(patch.updated_at, nowIso);
});

test("buildSubscriptionUpsert injects user_id and carries through patch fields", () => {
  const nowIso = "2026-02-11T00:00:00.000Z";
  const row = buildSubscriptionUpsert({
    id: "sub_1",
    customerId: "cus_1",
    productId: "prod_1",
    status: "active",
    amount: 1900,
    currency: "eur",
    recurringInterval: "month",
    currentPeriodStart: "2026-02-01T00:00:00.000Z",
    currentPeriodEnd: "2026-03-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
  }, "user_123", nowIso);

  assert.equal(row.user_id, "user_123");
  assert.equal(row.id, "sub_1");
  assert.equal(row.status, "active");
  assert.equal(row.created_at, "2026-02-01T00:00:00.000Z");
  assert.equal(row.updated_at, nowIso);
});
