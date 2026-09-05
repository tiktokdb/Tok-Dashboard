import { google } from "googleapis";
import { SUBSCRIPTION_HEADERS, canonicalizeSubscriptionRows } from "./subscriptionLedger.js";

const WEBHOOK_HEADERS = ["event_id", "event_type", "created_at", "processed_at"];

function isoFromUnix(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : "";
}

function objectFromRow(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
}

function valuesFromObject(headers, obj) {
  return headers.map((header) => obj[header] ?? "");
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
    const existingRows = (resp.data.values || []).map((row) =>
      objectFromRow(SUBSCRIPTION_HEADERS, row)
    );

    const { rows, merged } = canonicalizeSubscriptionRows(existingRows, next);

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "Subscriptions!A2:O"
    });

    if (rows.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Subscriptions!A2",
        valueInputOption: "RAW",
        requestBody: { values: rows.map((row) => valuesFromObject(SUBSCRIPTION_HEADERS, row)) }
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
