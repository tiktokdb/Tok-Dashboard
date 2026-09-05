import fs from "node:fs/promises";
import { getReconcileConfig } from "../src/config.js";
import { normalizeEmail } from "../src/email.js";
import { createSheetsClient } from "../src/sheets.js";
import { createStripeClient } from "../src/stripeClient.js";

async function listStripeSubscriptions(stripe) {
  const records = [];
  for await (const subscription of stripe.subscriptions.list({
    status: "all",
    expand: ["data.customer", "data.items.data.price"],
    limit: 100
  })) {
    const customer = typeof subscription.customer === "object" ? subscription.customer : null;
    const email = customer?.email || "";
    records.push({
      login_email: String(email).trim().toLowerCase(),
      normalized_email: normalizeEmail(email),
      stripe_customer_id: customer?.id || subscription.customer || "",
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items?.data?.[0]?.price?.id || "",
      status: subscription.status,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : ""
    });
  }
  return records;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function isActiveStripeSubscription(row) {
  return ["active", "trialing", "past_due"].includes(String(row.status).toLowerCase());
}

async function main() {
  const config = getReconcileConfig();
  const stripe = createStripeClient(config);
  const sheets = createSheetsClient(config);

  const [allowlist, stripeSubscriptions] = await Promise.all([
    sheets.readAllowlist(),
    listStripeSubscriptions(stripe)
  ]);

  const normalizedAllowlist = allowlist.map((entry) => ({
    entry,
    normalized_email: normalizeEmail(entry)
  }));
  const allowlistSet = new Set(normalizedAllowlist.map((row) => row.normalized_email));
  const activeStripe = stripeSubscriptions.filter(isActiveStripeSubscription);
  const activeStripeSet = new Set(activeStripe.map((row) => row.normalized_email).filter(Boolean));

  const byEmail = groupBy(stripeSubscriptions.filter((row) => row.normalized_email), (row) => row.normalized_email);
  const duplicateCustomers = [];
  const multipleSubscriptions = [];

  for (const [email, rows] of byEmail.entries()) {
    const customerIds = new Set(rows.map((row) => row.stripe_customer_id).filter(Boolean));
    if (customerIds.size > 1) {
      duplicateCustomers.push({ normalized_email: email, customer_ids: [...customerIds], subscriptions: rows });
    }
    if (rows.length > 1) {
      multipleSubscriptions.push({ normalized_email: email, subscriptions: rows });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: "read_only_no_changes",
    counts: {
      allowlist_entries: allowlist.length,
      stripe_subscriptions: stripeSubscriptions.length,
      active_stripe_subscriptions: activeStripe.length
    },
    allowlist_without_active_stripe: normalizedAllowlist.filter((row) => !activeStripeSet.has(row.normalized_email)),
    active_stripe_not_allowlisted: activeStripe.filter((row) => row.normalized_email && !allowlistSet.has(row.normalized_email)),
    stripe_subscriptions_without_email: stripeSubscriptions.filter((row) => !row.normalized_email),
    duplicate_stripe_customers_by_email: duplicateCustomers,
    multiple_subscriptions_by_email: multipleSubscriptions,
    note: "This script does not modify Stripe, the Subscriptions tab, or the Allowlist tab."
  };

  await fs.writeFile(config.reconciliationReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote read-only reconciliation report to ${config.reconciliationReportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
