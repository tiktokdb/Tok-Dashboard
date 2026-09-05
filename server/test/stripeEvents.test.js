import test from "node:test";
import assert from "node:assert/strict";
import { handleStripeEvent } from "../src/stripeEvents.js";
import { canonicalizeSubscriptionRows } from "../src/subscriptionLedger.js";
import { normalizeEmail } from "../src/email.js";

const config = {
  monthlyPriceId: "price_monthly_test",
  yearlyPriceId: "price_yearly_test"
};

function subscription(status, eventSuffix, extra = {}) {
  return {
    id: "sub_test_123",
    customer: {
      id: "cus_test_123",
      email: "Mas.Gorden+tok@gmail.com"
    },
    status,
    current_period_end: 1798761600,
    cancel_at_period_end: false,
    canceled_at: null,
    cancel_at: null,
    items: {
      data: [{ price: { id: "price_monthly_test" } }]
    },
    metadata: { eventSuffix },
    ...extra
  };
}

function event(id, type, object) {
  return {
    id,
    type,
    created: 1790000000,
    data: { object }
  };
}

class FakeSheets {
  constructor({ allowlist = [], metadata = [] } = {}) {
    this.rows = [];
    this.allowlist = allowlist;
    this.metadata = metadata;
    this.processedEvents = new Set();
  }

  async hasProcessedEvent(eventId) {
    return this.processedEvents.has(eventId);
  }

  async recordProcessedEvent(evt) {
    this.processedEvents.add(evt.id);
  }

  async upsertSubscription(next) {
    const { rows, merged } = canonicalizeSubscriptionRows(this.rows, next);
    this.rows = rows;
    return merged;
  }

  async findSubscriptionsByNormalizedEmail(normalizedEmail) {
    return this.rows.filter((row) => row.normalized_email === normalizedEmail);
  }

  async readAllowlist() {
    return this.allowlist;
  }

  async readAllowlistMetadata() {
    return this.metadata;
  }

  async appendAllowlistEmail(email) {
    if (!this.allowlist.some((entry) => normalizeEmail(entry) === normalizeEmail(email))) {
      this.allowlist.push(email);
    }
  }

  async removeStripeManagedAllowlistEmail(email) {
    const index = this.allowlist.findIndex((entry) => normalizeEmail(entry) === normalizeEmail(email));
    if (index >= 0) this.allowlist.splice(index, 1);
  }

  async upsertAllowlistMetadata(next) {
    const index = this.metadata.findIndex((row) => row.normalized_email === next.normalized_email);
    if (index >= 0) {
      this.metadata[index] = { ...this.metadata[index], ...next };
      return this.metadata[index];
    }
    this.metadata.push(next);
    return next;
  }
}

test("Stripe subscription events update one canonical subscription row", async () => {
  const sheets = new FakeSheets();
  let retrievedSubscription = subscription("active", "checkout");
  const stripe = { subscriptions: { retrieve: async () => retrievedSubscription } };

  await handleStripeEvent({
    event: event("evt_checkout", "checkout.session.completed", {
      subscription: "sub_test_123"
    }),
    stripe,
    sheets,
    config
  });

  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0].stripe_subscription_id, "sub_test_123");
  assert.equal(sheets.rows[0].latest_event_id, "evt_checkout");
  assert.equal(sheets.rows[0].status, "active");
  assert.equal(sheets.rows[0].normalized_email, "masgorden@gmail.com");

  retrievedSubscription = subscription("active", "created");
  await handleStripeEvent({
    event: event("evt_created", "customer.subscription.created", { id: "sub_test_123" }),
    stripe,
    sheets,
    config
  });

  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0].latest_event_id, "evt_created");
  assert.equal(sheets.rows[0].status, "active");

  retrievedSubscription = subscription("active", "updated", { cancel_at_period_end: true });
  await handleStripeEvent({
    event: event(
      "evt_updated",
      "customer.subscription.updated",
      { id: "sub_test_123", status: "active", cancel_at_period_end: true }
    ),
    stripe,
    sheets,
    config
  });

  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0].latest_event_id, "evt_updated");
  assert.equal(sheets.rows[0].cancel_at_period_end, "true");

  await handleStripeEvent({
    event: event(
      "evt_deleted",
      "customer.subscription.deleted",
      subscription("canceled", "deleted", { canceled_at: 1791000000 })
    ),
    stripe,
    sheets,
    config
  });

  assert.equal(sheets.rows.length, 1);
  assert.equal(sheets.rows[0].latest_event_id, "evt_deleted");
  assert.equal(sheets.rows[0].status, "canceled");
  assert.equal(sheets.rows[0].stripe_subscription_id, "sub_test_123");
});
