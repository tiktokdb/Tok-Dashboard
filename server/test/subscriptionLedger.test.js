import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeSubscriptionRows } from "../src/subscriptionLedger.js";

test("preserves paid-through fields when a later subscription event omits them", () => {
  const existing = {
    login_email: "customer@example.com",
    normalized_email: "customer@example.com",
    stripe_customer_id: "cus_test",
    stripe_subscription_id: "sub_test",
    status: "active",
    current_period_end: "2026-10-05T00:00:00.000Z",
    paid_through_date: "2026-10-05T00:00:00.000Z",
    cancel_at_period_end: "false",
    latest_event_id: "evt_created"
  };

  const { merged, rows } = canonicalizeSubscriptionRows([existing], {
    stripe_subscription_id: "sub_test",
    status: "active",
    current_period_end: "",
    paid_through_date: "",
    cancel_at_period_end: "true",
    latest_event_id: "evt_updated"
  });

  assert.equal(rows.length, 1);
  assert.equal(merged.current_period_end, "2026-10-05T00:00:00.000Z");
  assert.equal(merged.paid_through_date, "2026-10-05T00:00:00.000Z");
  assert.equal(merged.cancel_at_period_end, "true");
  assert.equal(merged.latest_event_id, "evt_updated");
});
