import "dotenv/config";

function optional(name, fallback = "") {
  return process.env[name] || fallback;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getServerConfig() {
  return {
    nodeEnv: optional("NODE_ENV", "development"),
    port: Number(optional("PORT", "10000")),
    allowedOrigin: optional("ALLOWED_ORIGIN", "http://localhost:5173"),
    googleClientId: required("GOOGLE_CLIENT_ID"),
    googleBillingSheetId: required("GOOGLE_BILLING_SHEET_ID"),
    googleServiceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    googleServiceAccountPrivateKey: required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    stripeSecretKey: required("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    stripePortalReturnUrl: required("STRIPE_PORTAL_RETURN_URL"),
    monthlyPriceId: optional("MONTHLY_PRICE_ID"),
    yearlyPriceId: optional("YEARLY_PRICE_ID")
  };
}

export function getReconcileConfig() {
  return {
    nodeEnv: optional("NODE_ENV", "development"),
    googleBillingSheetId: required("GOOGLE_BILLING_SHEET_ID"),
    googleServiceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    googleServiceAccountPrivateKey: required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    stripeSecretKey: required("STRIPE_SECRET_KEY"),
    monthlyPriceId: optional("MONTHLY_PRICE_ID"),
    yearlyPriceId: optional("YEARLY_PRICE_ID"),
    reconciliationReportPath: optional("RECONCILIATION_REPORT_PATH", "reconciliation-report.json")
  };
}
