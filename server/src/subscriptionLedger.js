import { normalizeEmail } from "./email.js";

export const SUBSCRIPTION_HEADERS = [
  "login_email",
  "normalized_email",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "plan",
  "status",
  "current_period_end",
  "paid_through_date",
  "cancel_at_period_end",
  "cancellation_date",
  "created_at",
  "updated_at",
  "latest_event_id",
  "source"
];

function isoFromUnix(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : "";
}

const PRESERVE_EXISTING_WHEN_EMPTY = new Set([
  "login_email",
  "normalized_email",
  "stripe_customer_id",
  "stripe_price_id",
  "plan",
  "current_period_end",
  "paid_through_date",
  "cancellation_date"
]);

function mergeSubscriptionRow(existing, next) {
  const createdAt = [existing.created_at, next.created_at].filter(Boolean).sort()[0] || "";
  const merged = {
    ...existing,
    created_at: createdAt || next.created_at || existing.created_at || new Date().toISOString()
  };

  for (const [key, value] of Object.entries(next)) {
    if (PRESERVE_EXISTING_WHEN_EMPTY.has(key) && (value === "" || value === null || value === undefined)) {
      continue;
    }
    merged[key] = value;
  }

  return merged;
}

export function canonicalizeSubscriptionRows(existingRows, next) {
  if (!next.stripe_subscription_id) {
    throw new Error("Cannot upsert subscription without stripe_subscription_id");
  }

  const bySubscriptionId = new Map();
  const rowsWithoutSubscriptionId = [];

  for (const row of existingRows) {
    const subscriptionId = row.stripe_subscription_id;
    if (!subscriptionId) {
      rowsWithoutSubscriptionId.push(row);
      continue;
    }

    const current = bySubscriptionId.get(subscriptionId);
    bySubscriptionId.set(
      subscriptionId,
      current ? mergeSubscriptionRow(current, row) : row
    );
  }

  const existing = bySubscriptionId.get(next.stripe_subscription_id) || {};
  const merged = mergeSubscriptionRow(existing, {
    ...next,
    normalized_email: next.normalized_email || normalizeEmail(next.login_email || existing.login_email),
    created_at: existing.created_at || next.created_at || new Date().toISOString()
  });

  bySubscriptionId.set(next.stripe_subscription_id, merged);

  return {
    rows: [...rowsWithoutSubscriptionId, ...bySubscriptionId.values()],
    merged
  };
}

export function planFromPrice(priceId, config) {
  if (priceId && config.monthlyPriceId && priceId === config.monthlyPriceId) return "monthly";
  if (priceId && config.yearlyPriceId && priceId === config.yearlyPriceId) return "yearly";
  return priceId || "unknown";
}

export function rowFromStripeSubscription(subscription, customer, eventId, source, config) {
  const priceId = subscription.items?.data?.[0]?.price?.id || "";
  const customerEmail = customer?.email || subscription.customer_email || "";
  const normalizedEmail = normalizeEmail(customerEmail);
  const periodEnd = isoFromUnix(subscription.current_period_end);
  const cancellationDate = isoFromUnix(subscription.canceled_at || subscription.cancel_at);
  const now = new Date().toISOString();

  return {
    login_email: customerEmail ? String(customerEmail).trim().toLowerCase() : "",
    normalized_email: normalizedEmail,
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || "",
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan: planFromPrice(priceId, config),
    status: subscription.status || "",
    current_period_end: periodEnd,
    paid_through_date: periodEnd,
    cancel_at_period_end: String(Boolean(subscription.cancel_at_period_end)),
    cancellation_date: cancellationDate,
    updated_at: now,
    latest_event_id: eventId || "",
    source
  };
}
