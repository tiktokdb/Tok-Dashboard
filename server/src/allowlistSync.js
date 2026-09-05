import { normalizeEmail } from "./email.js";
import { aggregateAccess } from "./entitlements.js";

export const ALLOWLIST_METADATA_HEADERS = [
  "normalized_email",
  "allowlist_value",
  "source",
  "owns_allowlist_entry",
  "first_added_at",
  "updated_at",
  "latest_event_id"
];

function allowlistHasNormalizedEmail(entries, normalizedEmail) {
  return entries.some((entry) => normalizeEmail(entry) === normalizedEmail);
}

export async function syncAllowlistForEmail({ sheets, normalizedEmail, latestEventId, now = new Date() }) {
  if (!normalizedEmail) {
    return { changed: false, action: "skipped_missing_email" };
  }

  const [subscriptions, allowlistEntries, metadataRows] = await Promise.all([
    sheets.findSubscriptionsByNormalizedEmail(normalizedEmail),
    sheets.readAllowlist(),
    sheets.readAllowlistMetadata()
  ]);

  const access = aggregateAccess(subscriptions, now);
  const existingMetadata = metadataRows.find((row) => row.normalized_email === normalizedEmail);
  const isAllowlisted = allowlistHasNormalizedEmail(allowlistEntries, normalizedEmail);
  const timestamp = now.toISOString();

  if (access.hasAccess) {
    if (!isAllowlisted) {
      await sheets.appendAllowlistEmail(normalizedEmail);
      await sheets.upsertAllowlistMetadata({
        normalized_email: normalizedEmail,
        allowlist_value: normalizedEmail,
        source: "stripe_managed",
        owns_allowlist_entry: "true",
        first_added_at: existingMetadata?.first_added_at || timestamp,
        updated_at: timestamp,
        latest_event_id: latestEventId || ""
      });
      return { changed: true, action: "added_stripe_managed_allowlist_entry" };
    }

    await sheets.upsertAllowlistMetadata({
      normalized_email: normalizedEmail,
      allowlist_value: existingMetadata?.allowlist_value || normalizedEmail,
      source: "stripe_managed",
      owns_allowlist_entry: existingMetadata?.owns_allowlist_entry || "false",
      first_added_at: existingMetadata?.first_added_at || timestamp,
      updated_at: timestamp,
      latest_event_id: latestEventId || ""
    });
    return { changed: false, action: "already_allowlisted" };
  }

  if (existingMetadata?.owns_allowlist_entry === "true") {
    await sheets.removeStripeManagedAllowlistEmail(existingMetadata.allowlist_value || normalizedEmail);
    await sheets.upsertAllowlistMetadata({
      ...existingMetadata,
      owns_allowlist_entry: "false",
      updated_at: timestamp,
      latest_event_id: latestEventId || ""
    });
    return { changed: true, action: "removed_expired_stripe_managed_allowlist_entry" };
  }

  if (existingMetadata) {
    await sheets.upsertAllowlistMetadata({
      ...existingMetadata,
      updated_at: timestamp,
      latest_event_id: latestEventId || ""
    });
  }

  return { changed: false, action: "no_qualifying_subscription_no_owned_entry" };
}
