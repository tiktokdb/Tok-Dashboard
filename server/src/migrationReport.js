import { normalizeEmail } from "./email.js";
import { subscriptionQualifies } from "./entitlements.js";
import { rowFromStripeSubscription } from "./subscriptionLedger.js";

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function normalizedAllowlistEntries(allowlist) {
  return allowlist.map((entry) => ({
    entry,
    normalized_email: normalizeEmail(entry),
    is_domain_rule: String(entry || "").trim().startsWith("@")
  }));
}

function metadataSourceForEmail(metadataRows, normalizedEmail) {
  const row = metadataRows.find((item) => item.normalized_email === normalizedEmail);
  if (!row) return "manual_legacy_default";
  if (row.owns_allowlist_entry === "true") return "stripe_owned_metadata";
  return row.source || "manual_legacy_metadata";
}

export function stripeRecordFromSubscription(subscription, config) {
  const customer = typeof subscription.customer === "object" ? subscription.customer : null;
  return rowFromStripeSubscription(subscription, customer, "", "stripe_live_scan", config);
}

export function buildMigrationReport({
  stripeSubscriptions,
  allowlist,
  allowlistMetadata,
  ledgerSubscriptions,
  generatedAt = new Date().toISOString(),
  mode = "dry-run"
}) {
  const allowlistRows = normalizedAllowlistEntries(allowlist);
  const allowlistByEmail = groupBy(
    allowlistRows.filter((row) => row.normalized_email && !row.is_domain_rule),
    (row) => row.normalized_email
  );
  const allowlistSet = new Set(allowlistByEmail.keys());
  const stripeByEmail = groupBy(
    stripeSubscriptions.filter((row) => row.normalized_email),
    (row) => row.normalized_email
  );
  const qualifyingStripe = stripeSubscriptions.filter((row) => subscriptionQualifies(row));
  const qualifyingStripeByEmail = groupBy(qualifyingStripe, (row) => row.normalized_email);
  const qualifyingStripeSet = new Set(qualifyingStripeByEmail.keys());

  const activeMatchingAllowlist = qualifyingStripe
    .filter((row) => allowlistSet.has(row.normalized_email))
    .map((row) => ({
      ...row,
      allowlist_entries: allowlistByEmail.get(row.normalized_email)?.map((item) => item.entry) || []
    }));

  const activeMissingAllowlist = qualifyingStripe
    .filter((row) => row.normalized_email && !allowlistSet.has(row.normalized_email));

  const allowlistNoActiveStripe = allowlistRows
    .filter((row) => !row.is_domain_rule)
    .filter((row) => row.normalized_email && !qualifyingStripeSet.has(row.normalized_email))
    .map((row) => ({
      ...row,
      source_classification: metadataSourceForEmail(allowlistMetadata, row.normalized_email)
    }));

  const duplicateCustomers = [];
  const multipleQualifyingSubscriptions = [];

  for (const [normalizedEmail, rows] of stripeByEmail.entries()) {
    const customerIds = new Set(rows.map((row) => row.stripe_customer_id).filter(Boolean));
    if (customerIds.size > 1) {
      duplicateCustomers.push({
        normalized_email: normalizedEmail,
        stripe_customer_ids: [...customerIds],
        subscriptions: rows
      });
    }
  }

  for (const [normalizedEmail, rows] of qualifyingStripeByEmail.entries()) {
    if (rows.length > 1) {
      multipleQualifyingSubscriptions.push({
        normalized_email: normalizedEmail,
        qualifying_subscriptions: rows
      });
    }
  }

  const historicalStripeSubscriptions = stripeSubscriptions.filter((row) => !subscriptionQualifies(row));

  const stripeBillingEmailDiffersFromAllowlist = activeMatchingAllowlist
    .flatMap((row) => {
      const entries = allowlistByEmail.get(row.normalized_email) || [];
      return entries
        .filter((entry) => !entry.is_domain_rule)
        .filter((entry) => String(entry.entry || "").trim().toLowerCase() !== String(row.login_email || "").trim().toLowerCase())
        .map((entry) => ({
          normalized_email: row.normalized_email,
          stripe_billing_email: row.login_email,
          allowlist_entry: entry.entry,
          stripe_customer_id: row.stripe_customer_id,
          stripe_subscription_id: row.stripe_subscription_id
        }));
    });

  const stripeOwnedUsers = allowlistRows
    .filter((row) => metadataSourceForEmail(allowlistMetadata, row.normalized_email) === "stripe_owned_metadata");

  const manualLegacyUsers = allowlistRows
    .filter((row) => row.is_domain_rule || metadataSourceForEmail(allowlistMetadata, row.normalized_email) !== "stripe_owned_metadata");

  const ledgerBySubscription = new Set(ledgerSubscriptions.map((row) => row.stripe_subscription_id).filter(Boolean));
  const liveStripeMissingFromLedger = stripeSubscriptions
    .filter((row) => row.stripe_subscription_id && !ledgerBySubscription.has(row.stripe_subscription_id));

  return {
    generated_at: generatedAt,
    mode,
    safety: {
      dry_run_writes: false,
      apply_removes_allowlist_users: false,
      apply_changes_stripe_objects: false,
      existing_allowlist_defaults_to: "manual_legacy"
    },
    counts: {
      allowlist_entries: allowlistRows.length,
      allowlist_domain_rules: allowlistRows.filter((row) => row.is_domain_rule).length,
      allowlist_metadata_rows: allowlistMetadata.length,
      subscriptions_ledger_rows: ledgerSubscriptions.length,
      live_stripe_subscriptions: stripeSubscriptions.length,
      qualifying_live_stripe_subscriptions: qualifyingStripe.length,
      historical_live_stripe_subscriptions: historicalStripeSubscriptions.length
    },
    active_live_stripe_subscription_and_matching_allowlist_user: activeMatchingAllowlist,
    active_live_stripe_subscription_missing_from_allowlist: activeMissingAllowlist,
    allowlist_user_with_no_active_stripe_subscription: allowlistNoActiveStripe,
    duplicate_stripe_customers_for_same_normalized_email: duplicateCustomers,
    multiple_qualifying_subscriptions_for_one_email: multipleQualifyingSubscriptions,
    canceled_or_expired_historical_stripe_subscriptions: historicalStripeSubscriptions,
    stripe_billing_email_differs_from_login_or_allowlist_email: stripeBillingEmailDiffersFromAllowlist,
    manual_legacy_allowlist_users: manualLegacyUsers,
    stripe_owned_users: stripeOwnedUsers,
    live_stripe_subscriptions_missing_from_ledger: liveStripeMissingFromLedger
  };
}

export function metadataRowsForInitialMigration({ allowlist, allowlistMetadata, generatedAt }) {
  const existing = new Map(allowlistMetadata.map((row) => [row.normalized_email, row]));
  const seen = new Set();
  const rows = [];

  for (const item of normalizedAllowlistEntries(allowlist)) {
    if (!item.normalized_email || item.is_domain_rule) continue;
    if (seen.has(item.normalized_email)) continue;
    seen.add(item.normalized_email);
    const prior = existing.get(item.normalized_email);
    rows.push({
      normalized_email: item.normalized_email,
      allowlist_value: prior?.allowlist_value || item.entry,
      source: prior?.source || "manual_legacy",
      owns_allowlist_entry: prior?.owns_allowlist_entry || "false",
      first_added_at: prior?.first_added_at || generatedAt,
      updated_at: generatedAt,
      latest_event_id: prior?.latest_event_id || "migration"
    });
  }

  return rows;
}
