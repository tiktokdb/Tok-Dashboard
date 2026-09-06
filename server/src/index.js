import express from "express";
import cors from "cors";
import { getServerConfig } from "./config.js";
import { createGoogleAuth } from "./googleAuth.js";
import { createSheetsClient } from "./sheets.js";
import { createStripeClient } from "./stripeClient.js";
import { createPortalSessionForRequest } from "./billingPortal.js";
import { handleStripeEvent } from "./stripeEvents.js";

const config = getServerConfig();
const app = express();
const stripe = createStripeClient(config);
const sheets = createSheetsClient(config);
const googleAuth = createGoogleAuth(config);

app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        config.stripeWebhookSecret
      );
    } catch (err) {
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    try {
      const result = await handleStripeEvent({ event, stripe, sheets, config });
      return res.json(result);
    } catch (err) {
      console.error("Stripe webhook processing failed", err);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.use(cors({
  origin: config.allowedOrigin,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["authorization", "content-type"]
}));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/billing/portal", async (req, res) => {
  try {
    const session = await createPortalSessionForRequest({ req, googleAuth, sheets, stripe, config });
    return res.json({ url: session.url });
  } catch (err) {
    const status = err.status || 500;
    console.error("Billing portal request failed", err);
    return res.status(status).json({
      error: status === 500 ? "Could not open billing portal." : err.message
    });
  }
});

app.listen(config.port, async () => {
  await sheets.ensureLedgerSheets();
  console.log(`TokBoard billing server listening on ${config.port}`);
});
