import test from "node:test";
import assert from "node:assert/strict";
import { handleStripeEvent } from "../src/stripeEvents.js";
import { canonicalizeSubscriptionRows } from "../src/subscriptionLedger.js";
import { normalizeEmail } from "../src/email.js";

const config = {
  monthlyPriceId: "price_monthly_test",
  yearlyPriceId: "price_yearly_test"
};

function event(id, type, object) {
  return {
    id,
    type,
    created: 1790000000,
    data: { object }
  };
}

function subscription({
  id,
  customerId = "cus_test",
  email = "Mas.Gorden+tok@gmail.com",
  status = "active",
  priceId = "price_monthly_test",
  currentPeriodEnd = 1798761600,
  cancelAtPeriodEnd = false,
  canceledAt = null
}) {
  return {
    id,
    customer: { id: customerId, email },
    status,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: canceledAt,
    cancel_at: null,
    items: {
      data: [{ price: { id: priceId } }]
    }
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
    this.allowlist.push(email);
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

async function sendSubscriptionEvent(sheets, id, type, sub) {
  return handleStripeEvent({
    event: event(id, type, sub),
    stripe: {
      subscriptions: {
        retrieve: async () => sub
      }
    },
    sheets,
    config
  });
}

function hasAllowlistEmail(sheets, email = "masgorden@gmail.com") {
  return sheets.allowlist.some((entry) => normalizeEmail(entry) === normalizeEmail(email));
}

test("new monthly subscription adds email to Allowlist", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(
    sheets,
    "evt_monthly",
    "customer.subscription.created",
    subscription({ id: "sub_monthly", priceId: "price_monthly_test" })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
  assert.equal(sheets.metadata[0].owns_allowlist_entry, "true");
});

test("new yearly subscription adds email to Allowlist", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(
    sheets,
    "evt_yearly",
    "customer.subscription.created",
    subscription({ id: "sub_yearly", priceId: "price_yearly_test" })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
  assert.equal(sheets.rows[0].plan, "yearly");
});

test("cancel at period end leaves email in Allowlist", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(
    sheets,
    "evt_active",
    "customer.subscription.created",
    subscription({ id: "sub_canceling" })
  );
  await sendSubscriptionEvent(
    sheets,
    "evt_cancel_period_end",
    "customer.subscription.updated",
    subscription({ id: "sub_canceling", cancelAtPeriodEnd: true })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
});

test("customer.subscription.updated scheduling future cancellation keeps Allowlist entry", async () => {
  const sheets = new FakeSheets();
  const fullSubscription = subscription({ id: "sub_future_cancel", cancelAtPeriodEnd: true });

  await sendSubscriptionEvent(
    sheets,
    "evt_active",
    "customer.subscription.created",
    subscription({ id: "sub_future_cancel" })
  );

  await handleStripeEvent({
    event: event("evt_updated_thin", "customer.subscription.updated", {
      id: "sub_future_cancel",
      status: "active",
      cancel_at_period_end: true
    }),
    stripe: {
      subscriptions: {
        retrieve: async () => fullSubscription
      }
    },
    sheets,
    config
  });

  assert.equal(hasAllowlistEmail(sheets), true);
  assert.equal(sheets.rows[0].cancel_at_period_end, "true");
  assert.equal(sheets.rows[0].paid_through_date, "2027-01-01T00:00:00.000Z");
});

test("period actually expires removes Stripe-managed Allowlist entry when no other subscription qualifies", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(
    sheets,
    "evt_active",
    "customer.subscription.created",
    subscription({ id: "sub_expiring" })
  );
  await sendSubscriptionEvent(
    sheets,
    "evt_deleted",
    "customer.subscription.deleted",
    subscription({ id: "sub_expiring", status: "canceled", canceledAt: 1791000000 })
  );

  assert.equal(hasAllowlistEmail(sheets), false);
});

test("monthly expires but yearly remains active keeps email in Allowlist", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(
    sheets,
    "evt_monthly",
    "customer.subscription.created",
    subscription({ id: "sub_monthly", priceId: "price_monthly_test" })
  );
  await sendSubscriptionEvent(
    sheets,
    "evt_yearly",
    "customer.subscription.created",
    subscription({ id: "sub_yearly", priceId: "price_yearly_test" })
  );
  await sendSubscriptionEvent(
    sheets,
    "evt_monthly_deleted",
    "customer.subscription.deleted",
    subscription({ id: "sub_monthly", status: "canceled", canceledAt: 1791000000 })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
});

test("cancel-at-period-end monthly plus active yearly keeps access", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(
    sheets,
    "evt_monthly_canceling",
    "customer.subscription.created",
    subscription({
      id: "sub_monthly_canceling",
      priceId: "price_monthly_test",
      cancelAtPeriodEnd: true
    })
  );
  await sendSubscriptionEvent(
    sheets,
    "evt_yearly_active",
    "customer.subscription.created",
    subscription({ id: "sub_yearly_active", priceId: "price_yearly_test" })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
});

test("cancel-at-period-end yearly plus active monthly keeps access", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(
    sheets,
    "evt_yearly_canceling",
    "customer.subscription.created",
    subscription({
      id: "sub_yearly_canceling",
      priceId: "price_yearly_test",
      cancelAtPeriodEnd: true
    })
  );
  await sendSubscriptionEvent(
    sheets,
    "evt_monthly_active",
    "customer.subscription.created",
    subscription({ id: "sub_monthly_active", priceId: "price_monthly_test" })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
});

test("two active subscriptions, one canceled keeps email in Allowlist", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(sheets, "evt_a", "customer.subscription.created", subscription({ id: "sub_a" }));
  await sendSubscriptionEvent(sheets, "evt_b", "customer.subscription.created", subscription({ id: "sub_b" }));
  await sendSubscriptionEvent(
    sheets,
    "evt_a_deleted",
    "customer.subscription.deleted",
    subscription({ id: "sub_a", status: "canceled", canceledAt: 1791000000 })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
});

test("manual legacy Allowlist user with no Stripe subscription remains", async () => {
  const sheets = new FakeSheets({ allowlist: ["legacy@example.com"] });

  await sendSubscriptionEvent(
    sheets,
    "evt_other",
    "customer.subscription.deleted",
    subscription({
      id: "sub_other",
      email: "other@example.com",
      status: "canceled",
      canceledAt: 1791000000
    })
  );

  assert.equal(hasAllowlistEmail(sheets, "legacy@example.com"), true);
});

test("manual legacy user whose Stripe subscription ends remains", async () => {
  const sheets = new FakeSheets({ allowlist: ["Mas.Gorden@gmail.com"] });

  await sendSubscriptionEvent(sheets, "evt_active", "customer.subscription.created", subscription({ id: "sub_manual" }));
  await sendSubscriptionEvent(
    sheets,
    "evt_deleted",
    "customer.subscription.deleted",
    subscription({ id: "sub_manual", status: "canceled", canceledAt: 1791000000 })
  );

  assert.equal(hasAllowlistEmail(sheets), true);
  assert.equal(sheets.metadata[0].owns_allowlist_entry, "false");
});

test("repeated webhook does not create duplicate Allowlist entries", async () => {
  const sheets = new FakeSheets();
  const sub = subscription({ id: "sub_repeat" });

  await sendSubscriptionEvent(sheets, "evt_repeat", "customer.subscription.created", sub);
  await sendSubscriptionEvent(sheets, "evt_repeat", "customer.subscription.created", sub);

  assert.equal(sheets.allowlist.length, 1);
});

test("checkout and subscription.created granting same email create one Allowlist entry", async () => {
  const sheets = new FakeSheets();
  const sub = subscription({ id: "sub_checkout_created" });
  const stripe = {
    subscriptions: {
      retrieve: async () => sub
    }
  };

  await Promise.all([
    handleStripeEvent({
      event: event("evt_checkout", "checkout.session.completed", {
        subscription: "sub_checkout_created"
      }),
      stripe,
      sheets,
      config
    }),
    handleStripeEvent({
      event: event("evt_created", "customer.subscription.created", sub),
      stripe,
      sheets,
      config
    })
  ]);

  const matches = sheets.allowlist.filter((entry) => normalizeEmail(entry) === "masgorden@gmail.com");
  assert.equal(matches.length, 1);
});

test("refund event alone does not remove access", async () => {
  const sheets = new FakeSheets();

  await sendSubscriptionEvent(sheets, "evt_active", "customer.subscription.created", subscription({ id: "sub_refund" }));
  await handleStripeEvent({
    event: event("evt_refund", "charge.refunded", { id: "ch_test" }),
    stripe: {},
    sheets,
    config
  });

  assert.equal(hasAllowlistEmail(sheets), true);
});
