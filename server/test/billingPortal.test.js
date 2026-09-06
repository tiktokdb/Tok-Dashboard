import test from "node:test";
import assert from "node:assert/strict";
import { getBillingStatusForRequest, selectPortalCustomer } from "../src/billingPortal.js";

const now = new Date("2026-09-05T00:00:00.000Z");

function row(customerId, status, overrides = {}) {
  return {
    stripe_customer_id: customerId,
    stripe_subscription_id: `${customerId}_${status}`,
    status,
    current_period_end: "2026-12-01T00:00:00.000Z",
    paid_through_date: "2026-12-01T00:00:00.000Z",
    cancel_at_period_end: "false",
    ...overrides
  };
}

test("one active customer plus one historical canceled customer opens active customer", () => {
  const result = selectPortalCustomer([
    row("cus_old", "canceled", { paid_through_date: "2026-01-01T00:00:00.000Z" }),
    row("cus_active", "active")
  ], now);

  assert.equal(result.ok, true);
  assert.equal(result.customerId, "cus_active");
});

test("yearly active customer plus old canceled monthly customer opens yearly customer", () => {
  const result = selectPortalCustomer([
    row("cus_monthly_old", "canceled", {
      plan: "monthly",
      stripe_price_id: "price_monthly_old",
      paid_through_date: "2026-01-01T00:00:00.000Z"
    }),
    row("cus_yearly_active", "active", {
      plan: "yearly",
      stripe_price_id: "price_yearly"
    })
  ], now);

  assert.equal(result.ok, true);
  assert.equal(result.customerId, "cus_yearly_active");
});

test("two different customers both active returns reconciliation error", () => {
  const result = selectPortalCustomer([
    row("cus_active_a", "active"),
    row("cus_active_b", "trialing")
  ], now);

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("only historical canceled customers returns no-active-subscription error", () => {
  const result = selectPortalCustomer([
    row("cus_old_a", "canceled", { paid_through_date: "2026-01-01T00:00:00.000Z" }),
    row("cus_old_b", "unpaid", { paid_through_date: "2026-12-01T00:00:00.000Z" })
  ], now);

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("cancel-at-period-end subscription still paid through qualifies", () => {
  const result = selectPortalCustomer([
    row("cus_canceling", "active", {
      cancel_at_period_end: "true",
      paid_through_date: "2026-10-01T00:00:00.000Z"
    })
  ], now);

  assert.equal(result.ok, true);
  assert.equal(result.customerId, "cus_canceling");
});

test("billing status returns true without exposing Stripe identifiers for qualifying subscriptions", async () => {
  const status = await getBillingStatusForRequest({
    req: {},
    googleAuth: {
      verifyRequest: async () => ({ email: "paid@example.com" })
    },
    sheets: {
      findSubscriptionsByNormalizedEmail: async () => [row("cus_paid", "active")]
    }
  });

  assert.deepEqual(status, {
    canManageBilling: true,
    reason: ""
  });
  assert.equal("customerId" in status, false);
  assert.equal("qualifyingSubscriptions" in status, false);
});

test("billing status returns false for manual legacy users without Stripe subscriptions", async () => {
  const status = await getBillingStatusForRequest({
    req: {},
    googleAuth: {
      verifyRequest: async () => ({ email: "legacy@example.com" })
    },
    sheets: {
      findSubscriptionsByNormalizedEmail: async () => []
    }
  });

  assert.equal(status.canManageBilling, false);
  assert.match(status.reason, /No active paid subscription/);
});
