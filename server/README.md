# TokBoard Billing Backend

Standalone Node/Express service for Stripe billing and subscription ledger work.

Phase 1 behavior:

- Verifies Google access tokens server-side for protected routes.
- Creates Stripe Customer Portal sessions only after deriving the email from a verified Google token.
- Handles Stripe webhooks idempotently with a `WebhookEvents` tab.
- Upserts subscription state into a `Subscriptions` tab.
- Syncs Stripe-managed access into the existing `Allowlist` tab while preserving manual/legacy rows.

## Allowlist Metadata

The frontend still reads `Allowlist!A:A`.

The backend uses a separate `AllowlistMetadata` tab to track which rows it owns:

- `owns_allowlist_entry=true`: the backend appended this email because no matching Allowlist entry existed.
- `owns_allowlist_entry=false`: the email was already present, so it is treated as manual/legacy access.

Webhook expiration only removes backend-owned entries, and only after all subscriptions for the normalized email no longer qualify.

## Endpoints

- `GET /api/health`
- `POST /api/billing/portal`
  - Requires `Authorization: Bearer <Google access token>`.
  - The request body is ignored for identity and customer selection.
- `POST /api/webhooks/stripe`
  - Requires the Stripe webhook signature header.

## Required Environment Variables

See the root `.env.example`.

## Production Reconciliation / Migration

The reconciliation script can be pointed at live Stripe before the live webhook is enabled. It reads live Stripe subscriptions and the Google Sheet, then writes a local JSON report.

Dry-run mode is the default and performs no writes:

```bash
npm run reconcile -- --dry-run
```

Useful production dry-run command:

```bash
RECONCILIATION_REPORT_PATH=reports/live-reconciliation-dry-run.json npm run reconcile -- --dry-run
```

Required environment variables for reconciliation:

- `GOOGLE_BILLING_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `STRIPE_SECRET_KEY`
- `MONTHLY_PRICE_ID`
- `YEARLY_PRICE_ID`
- `RECONCILIATION_REPORT_PATH` (optional)

The reconciliation config does not require `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_RETURN_URL`, or `GOOGLE_CLIENT_ID`, so it can run before the production webhook and Customer Portal routes are enabled.

The report includes:

```json
{
  "generated_at": "2026-09-05T00:00:00.000Z",
  "mode": "dry-run",
  "safety": {
    "dry_run_writes": false,
    "apply_removes_allowlist_users": false,
    "apply_changes_stripe_objects": false,
    "existing_allowlist_defaults_to": "manual_legacy"
  },
  "counts": {},
  "active_live_stripe_subscription_and_matching_allowlist_user": [],
  "active_live_stripe_subscription_missing_from_allowlist": [],
  "allowlist_user_with_no_active_stripe_subscription": [],
  "duplicate_stripe_customers_for_same_normalized_email": [],
  "multiple_qualifying_subscriptions_for_one_email": [],
  "canceled_or_expired_historical_stripe_subscriptions": [],
  "stripe_billing_email_differs_from_login_or_allowlist_email": [],
  "manual_legacy_allowlist_users": [],
  "stripe_owned_users": [],
  "live_stripe_subscriptions_missing_from_ledger": []
}
```

Apply mode is intentionally explicit:

```bash
npm run reconcile -- --apply --confirm-preserve-allowlist
```

Initial apply mode only:

- Upserts live Stripe subscription history/state into `Subscriptions`.
- Populates or updates `AllowlistMetadata` for existing `Allowlist` email rows.
- Preserves existing `Allowlist` rows.
- Does not remove users.
- Does not add missing active Stripe users to `Allowlist`.
- Does not modify Stripe customers, subscriptions, prices, payment links, refunds, or invoices.

Existing `Allowlist` rows default to `source=manual_legacy` and `owns_allowlist_entry=false` unless existing metadata already proves Stripe ownership.

## Production Cutover Checklist

Render live backend environment variables:

- `NODE_ENV=production`
- `ALLOWED_ORIGIN=https://<existing TokBoard frontend hostname>`
- `GOOGLE_CLIENT_ID=<existing frontend Google OAuth client ID>`
- `GOOGLE_BILLING_SHEET_ID=<production Google Sheet ID>`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL=<production service account email>`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<production service account private key with escaped newlines>`
- `STRIPE_SECRET_KEY=<live mode secret key>`
- `STRIPE_WEBHOOK_SECRET=<live webhook endpoint signing secret>`
- `STRIPE_PORTAL_RETURN_URL=https://<existing TokBoard frontend hostname>`
- `MONTHLY_PRICE_ID=<live monthly recurring price ID>`
- `YEARLY_PRICE_ID=<live yearly recurring price ID>`

Stripe live-mode checklist:

- Confirm the account is in live mode.
- Confirm the live monthly and yearly prices match the existing payment links.
- Configure Customer Portal in live mode and enable subscription cancellation.
- Prefer cancellation at period end.
- Add the live webhook endpoint: `https://<billing-backend-host>/api/webhooks/stripe`.
- Subscribe the endpoint to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `charge.refunded`.
- Copy the live webhook signing secret into Render as `STRIPE_WEBHOOK_SECRET`.

Rollback:

- Point the existing frontend back to the prior deployed branch or `main`.
- Remove or disable the live Stripe webhook endpoint if webhook traffic must stop.
- Restore the previous Render backend environment if needed.
- Do not delete `Subscriptions` or `AllowlistMetadata`; they are audit/ownership records and initial migration never removes access.

## Render Test Service

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`

Use Stripe test-mode keys until production deployment is explicitly approved.
