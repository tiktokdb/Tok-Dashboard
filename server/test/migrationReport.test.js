import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMigrationReport,
  metadataRowsForInitialMigration
} from "../src/migrationReport.js";

const NOW = "2026-09-05T12:00:00.000Z";
const FUTURE = "2099-10-05T12:00:00.000Z";
const PAST = "2000-08-05T12:00:00.000Z";

function subscription(overrides = {}) {
  const email = overrides.login_email || "buyer@example.com";
  return {
    login_email: email,
    normalized_email: email.trim().toLowerCase(),
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    stripe_price_id: "price_monthly",
    plan: "monthly",
    status: "active",
    current_period_end: FUTURE,
    paid_through_date: FUTURE,
    cancel_at_period_end: "false",
    cancellation_date: "",
    created_at: NOW,
    updated_at: NOW,
    latest_event_id: "evt_1",
    source: "stripe_live_scan",
    ...overrides
  };
}

test("migration report classifies Stripe, Allowlist, metadata, and ledger differences", () => {
  const activeMatched = subscription({
    login_email: "Paid.User@gmail.com",
    normalized_email: "paiduser@gmail.com",
    stripe_customer_id: "cus_active",
    stripe_subscription_id: "sub_active"
  });
  const activeMissing = subscription({
    login_email: "missing@example.com",
    stripe_customer_id: "cus_missing",
    stripe_subscription_id: "sub_missing"
  });
  const historical = subscription({
    login_email: "old@example.com",
    stripe_customer_id: "cus_old",
    stripe_subscription_id: "sub_old",
    status: "canceled",
    current_period_end: PAST,
    paid_through_date: PAST,
    cancellation_date: PAST
  });
  const duplicateCustomerA = subscription({
    login_email: "duplicate@example.com",
    stripe_customer_id: "cus_dup_a",
    stripe_subscription_id: "sub_dup_a"
  });
  const duplicateCustomerB = subscription({
    login_email: "duplicate@example.com",
    stripe_customer_id: "cus_dup_b",
    stripe_subscription_id: "sub_dup_b"
  });

  const report = buildMigrationReport({
    stripeSubscriptions: [activeMatched, activeMissing, historical, duplicateCustomerA, duplicateCustomerB],
    allowlist: ["paiduser@gmail.com", "legacy@example.com", "@example.org"],
    allowlistMetadata: [
      {
        normalized_email: "paiduser@gmail.com",
        allowlist_value: "paiduser@gmail.com",
        source: "stripe_managed",
        owns_allowlist_entry: "true"
      }
    ],
    ledgerSubscriptions: [activeMatched],
    generatedAt: NOW
  });

  assert.equal(report.safety.dry_run_writes, false);
  assert.equal(report.safety.apply_removes_allowlist_users, false);
  assert.equal(report.safety.existing_allowlist_defaults_to, "manual_legacy");
  assert.deepEqual(
    report.active_live_stripe_subscription_and_matching_allowlist_user.map((row) => row.stripe_subscription_id),
    ["sub_active"]
  );
  assert.deepEqual(
    report.active_live_stripe_subscription_missing_from_allowlist.map((row) => row.stripe_subscription_id).sort(),
    ["sub_dup_a", "sub_dup_b", "sub_missing"]
  );
  assert.deepEqual(
    report.allowlist_user_with_no_active_stripe_subscription.map((row) => row.normalized_email),
    ["legacy@example.com"]
  );
  assert.deepEqual(
    report.duplicate_stripe_customers_for_same_normalized_email.map((row) => row.normalized_email),
    ["duplicate@example.com"]
  );
  assert.deepEqual(
    report.multiple_qualifying_subscriptions_for_one_email.map((row) => row.normalized_email),
    ["duplicate@example.com"]
  );
  assert.deepEqual(
    report.canceled_or_expired_historical_stripe_subscriptions.map((row) => row.stripe_subscription_id),
    ["sub_old"]
  );
  assert.deepEqual(
    report.stripe_billing_email_differs_from_login_or_allowlist_email.map((row) => row.normalized_email),
    ["paiduser@gmail.com"]
  );
  assert.deepEqual(
    report.manual_legacy_allowlist_users.map((row) => row.entry).sort(),
    ["@example.org", "legacy@example.com"]
  );
  assert.deepEqual(
    report.stripe_owned_users.map((row) => row.normalized_email),
    ["paiduser@gmail.com"]
  );
  assert.deepEqual(
    report.live_stripe_subscriptions_missing_from_ledger.map((row) => row.stripe_subscription_id).sort(),
    ["sub_dup_a", "sub_dup_b", "sub_missing", "sub_old"]
  );
});

test("initial migration metadata preserves Allowlist ownership as manual by default", () => {
  const rows = metadataRowsForInitialMigration({
    allowlist: ["Manual.User@gmail.com", "@example.com", "known@example.com"],
    allowlistMetadata: [
      {
        normalized_email: "known@example.com",
        allowlist_value: "known@example.com",
        source: "stripe_managed",
        owns_allowlist_entry: "true",
        first_added_at: PAST,
        latest_event_id: "evt_existing"
      }
    ],
    generatedAt: NOW
  });

  assert.deepEqual(rows, [
    {
      normalized_email: "manualuser@gmail.com",
      allowlist_value: "Manual.User@gmail.com",
      source: "manual_legacy",
      owns_allowlist_entry: "false",
      first_added_at: NOW,
      updated_at: NOW,
      latest_event_id: "migration"
    },
    {
      normalized_email: "known@example.com",
      allowlist_value: "known@example.com",
      source: "stripe_managed",
      owns_allowlist_entry: "true",
      first_added_at: PAST,
      updated_at: NOW,
      latest_event_id: "evt_existing"
    }
  ]);
});
