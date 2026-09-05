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

## Reconciliation

Run in Stripe test mode first:

```bash
npm run reconcile
```

The script writes a read-only JSON report and does not modify Stripe, the ledger, or the Allowlist.

## Render Test Service

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`

Use Stripe test-mode keys until production deployment is explicitly approved.
