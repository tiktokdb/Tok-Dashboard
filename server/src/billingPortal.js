import { normalizeEmail } from "./email.js";
import { subscriptionQualifies } from "./entitlements.js";

export function selectPortalCustomer(subscriptions, now = new Date()) {
  const qualifying = subscriptions.filter((row) => subscriptionQualifies(row, now));
  const customerIds = [...new Set(
    qualifying
      .map((row) => row.stripe_customer_id)
      .filter(Boolean)
  )];

  if (customerIds.length === 0) {
    return {
      ok: false,
      status: 403,
      error: "No active paid subscription was found for this Google account."
    };
  }

  if (customerIds.length > 1) {
    return {
      ok: false,
      status: 409,
      error: "This account needs billing reconciliation before self-service billing can be opened."
    };
  }

  return {
    ok: true,
    customerId: customerIds[0],
    qualifyingSubscriptions: qualifying
  };
}

export async function createPortalSessionForRequest({ req, googleAuth, sheets, stripe, config }) {
  const { email } = await googleAuth.verifyRequest(req);
  const normalizedEmail = normalizeEmail(email);
  const subscriptions = await sheets.findSubscriptionsByNormalizedEmail(normalizedEmail);
  const selection = selectPortalCustomer(subscriptions);

  if (!selection.ok) {
    const err = new Error(selection.error);
    err.status = selection.status;
    throw err;
  }

  return stripe.billingPortal.sessions.create({
    customer: selection.customerId,
    return_url: config.stripePortalReturnUrl
  });
}

export async function getBillingStatusForRequest({ req, googleAuth, sheets }) {
  const { email } = await googleAuth.verifyRequest(req);
  const normalizedEmail = normalizeEmail(email);
  const subscriptions = await sheets.findSubscriptionsByNormalizedEmail(normalizedEmail);
  const selection = selectPortalCustomer(subscriptions);

  return {
    hasPaidSubscription: selection.ok
  };
}
