import { google } from "googleapis";
import { normalizeEmail } from "./email.js";

export const SUBSCRIPTION_HEADERS = [
  "login_email",
  "normalized_email",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "plan",
  "status",
  "current_period_end",
  "paid_through_date",
  "cancel_at_period_end",
  "cancellation_date",
  "created_at",
  "updated_at",
  "latest_event_id",
  "source"
];

const WEBHOOK_HEADERS = ["event_id", "event_type", "created_at", "processed_at"];

function isoFromUnix(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : "";
}

function valueAt(row, headers, name) {
  return row[headers.indexOf(name)] || "";
}

function objectFromRow(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
}

function valuesFromObject(headers, obj) {
  return headers.map((header) => obj[header] ?? "");
}

export function planFromPrice(priceId, config) {
  if (priceId && config.monthlyPriceId && priceId === config.monthlyPriceId) return "monthly";
  if (priceId && config.yearlyPriceId && priceId === config.yearlyPriceId) return "yearly";
  return priceId || "unknown";
}

export function rowFromStripeSubscription(subscription, customer, eventId, source, config) {
  const priceId = subscription.items?.data?.[0]?.price?.id || "";
  const customerEmail = customer?.email || subscription.customer_email || "";
  const normalizedEmail = normalizeEmail(customerEmail);
  const periodEnd = isoFromUnix(subscription.current_period_end);
  const cancellationDate = isoFromUnix(subscription.canceled_at || subscription.cancel_at);
  const now = new Date().toISOString();

  return {
    login_email: customerEmail ? String(customerEmail).trim().toLowerCase() : "",
    normalized_email: normalizedEmail,
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || "",
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan: planFromPrice(priceId, config),
    status: subscription.status || "",
    current_period_end: periodEnd,
    paid_through_date: periodEnd,
    cancel_at_period_end: String(Boolean(subscription.cancel_at_period_end)),
    cancellation_date: cancellationDate,
    updated_at: now,
    latest_event_id: eventId || "",
    source
  };
}

export function createSheetsClient(config) {
  const auth = new google.auth.JWT({
    email: config.googleServiceAccountEmail,
    key: config.googleServiceAccountPrivateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = config.googleBillingSheetId;

  async function ensureSheet(title, headers) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const hasSheet = (meta.data.sheets || []).some((sheet) => sheet.properties?.title === title);
    if (!hasSheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] }
      });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] }
    });
  }

  async function ensureLedgerSheets() {
    await ensureSheet("Subscriptions", SUBSCRIPTION_HEADERS);
    await ensureSheet("WebhookEvents", WEBHOOK_HEADERS);
  }

  async function readRows(title, headers) {
    await ensureLedgerSheets();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${title}'!A2:${String.fromCharCode(64 + headers.length)}`
    });
    return (resp.data.values || []).map((row) => objectFromRow(headers, row));
  }

  async function readAllowlist() {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Allowlist!A2:A"
    });
    return (resp.data.values || []).flat().map((value) => String(value).trim()).filter(Boolean);
  }

  async function hasProcessedEvent(eventId) {
    if (!eventId) return false;
    await ensureLedgerSheets();
    const rows = await readRows("WebhookEvents", WEBHOOK_HEADERS);
    return rows.some((row) => row.event_id === eventId);
  }

  async function recordProcessedEvent(event) {
    await ensureLedgerSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "WebhookEvents!A:D",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[event.id, event.type, isoFromUnix(event.created), new Date().toISOString()]]
      }
    });
  }

  async function upsertSubscription(next) {
    await ensureLedgerSheets();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Subscriptions!A2:O"
    });
    const rows = resp.data.values || [];
    const existingIndex = rows.findIndex(
      (row) => valueAt(row, SUBSCRIPTION_HEADERS, "stripe_subscription_id") === next.stripe_subscription_id
    );

    const existing = existingIndex >= 0 ? objectFromRow(SUBSCRIPTION_HEADERS, rows[existingIndex]) : {};
    const merged = {
      ...existing,
      ...next,
      normalized_email: next.normalized_email || normalizeEmail(next.login_email || existing.login_email),
      created_at: existing.created_at || next.created_at || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      const rowNumber = existingIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Subscriptions!A${rowNumber}:O${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [valuesFromObject(SUBSCRIPTION_HEADERS, merged)] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Subscriptions!A:O",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [valuesFromObject(SUBSCRIPTION_HEADERS, merged)] }
      });
    }

    return merged;
  }

  async function findSubscriptionsByNormalizedEmail(normalizedEmail) {
    const rows = await readRows("Subscriptions", SUBSCRIPTION_HEADERS);
    return rows.filter((row) => row.normalized_email === normalizedEmail);
  }

  return {
    ensureLedgerSheets,
    readAllowlist,
    readSubscriptions: () => readRows("Subscriptions", SUBSCRIPTION_HEADERS),
    findSubscriptionsByNormalizedEmail,
    hasProcessedEvent,
    recordProcessedEvent,
    upsertSubscription
  };
}
