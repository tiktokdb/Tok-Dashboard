# TokBoard Billing Backend

Standalone Node/Express service for Stripe billing and subscription ledger work.

Phase 1 behavior:

- Verifies Google access tokens server-side for protected routes.
- Creates Stripe Customer Portal sessions only after deriving the email from a verified Google token.
- Handles Stripe webhooks idempotently with a `WebhookEvents` tab.
- Upserts subscription state into a `Subscriptions` tab.
- Does not rewrite or delete the existing `Allowlist` tab.

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
