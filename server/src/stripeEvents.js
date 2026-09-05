import { rowFromStripeSubscription } from "./subscriptionLedger.js";

async function getCustomer(stripe, customerId) {
  if (!customerId || typeof customerId !== "string") return null;
  const customer = await stripe.customers.retrieve(customerId);
  return customer?.deleted ? null : customer;
}

async function upsertSubscriptionFromId({ stripe, sheets, config, subscriptionId, eventId, source }) {
  if (!subscriptionId) return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "customer"]
  });
  const customer = typeof subscription.customer === "string"
    ? await getCustomer(stripe, subscription.customer)
    : subscription.customer;
  return sheets.upsertSubscription(rowFromStripeSubscription(subscription, customer, eventId, source, config));
}

async function upsertSubscriptionObject({ stripe, sheets, config, subscription, eventId, source }) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  const customer = typeof subscription.customer === "object"
    ? subscription.customer
    : await getCustomer(stripe, customerId);
  return sheets.upsertSubscription(rowFromStripeSubscription(subscription, customer, eventId, source, config));
}

export async function handleStripeEvent({ event, stripe, sheets, config }) {
  if (await sheets.hasProcessedEvent(event.id)) {
    return { processed: false, reason: "duplicate_event" };
  }

  let result = null;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      result = await upsertSubscriptionObject({
        stripe,
        sheets,
        config,
        subscription: event.data.object,
        eventId: event.id,
        source: "stripe_webhook"
      });
      break;

    case "checkout.session.completed":
      result = await upsertSubscriptionFromId({
        stripe,
        sheets,
        config,
        subscriptionId: event.data.object.subscription,
        eventId: event.id,
        source: "checkout_session"
      });
      break;

    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      result = await upsertSubscriptionFromId({
        stripe,
        sheets,
        config,
        subscriptionId: event.data.object.subscription,
        eventId: event.id,
        source: "invoice"
      });
      break;

    case "charge.refunded":
      result = { note: "refund_recorded_no_entitlement_change" };
      break;

    default:
      result = { note: "ignored_event_type" };
      break;
  }

  await sheets.recordProcessedEvent(event);
  return { processed: true, result };
}
