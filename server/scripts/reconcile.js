import fs from "node:fs/promises";
import path from "node:path";
import { getReconcileConfig } from "../src/config.js";
import { createSheetsClient } from "../src/sheets.js";
import { createStripeClient } from "../src/stripeClient.js";
import {
  buildMigrationReport,
  metadataRowsForInitialMigration,
  stripeRecordFromSubscription
} from "../src/migrationReport.js";

async function listStripeSubscriptions(stripe, config) {
  const records = [];
  for await (const subscription of stripe.subscriptions.list({
    status: "all",
    expand: ["data.customer", "data.items.data.price"],
    limit: 100
  })) {
    records.push(stripeRecordFromSubscription(subscription, config));
  }
  return records;
}

function parseArgs(argv) {
  const args = new Set(argv);
  if (args.has("--apply") && !args.has("--confirm-preserve-allowlist")) {
    throw new Error("Apply mode requires --confirm-preserve-allowlist");
  }
  return {
    dryRun: !args.has("--apply"),
    apply: args.has("--apply")
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getReconcileConfig();
  const stripe = createStripeClient(config);
  const sheets = createSheetsClient(config);
  const generatedAt = new Date().toISOString();

  const [allowlist, allowlistMetadata, ledgerSubscriptions, stripeSubscriptions] = await Promise.all([
    sheets.readAllowlist(),
    sheets.readAllowlistMetadataReadOnly(),
    sheets.readSubscriptionsReadOnly(),
    listStripeSubscriptions(stripe, config)
  ]);

  const report = buildMigrationReport({
    stripeSubscriptions,
    allowlist,
    allowlistMetadata,
    ledgerSubscriptions,
    generatedAt,
    mode: args.dryRun ? "dry-run" : "apply_preserve_allowlist"
  });

  if (args.apply) {
    for (const row of stripeSubscriptions) {
      await sheets.upsertSubscription({
        ...row,
        updated_at: generatedAt,
        source: "live_migration"
      });
    }

    await sheets.upsertManyAllowlistMetadata(
      metadataRowsForInitialMigration({ allowlist, allowlistMetadata, generatedAt })
    );

    report.apply_summary = {
      subscriptions_upserted: stripeSubscriptions.length,
      allowlist_metadata_upserted: metadataRowsForInitialMigration({ allowlist, allowlistMetadata, generatedAt }).length,
      allowlist_rows_removed: 0,
      stripe_objects_modified: 0
    };
  }

  const reportDirectory = path.dirname(config.reconciliationReportPath);
  if (reportDirectory && reportDirectory !== ".") {
    await fs.mkdir(reportDirectory, { recursive: true });
  }

  await fs.writeFile(config.reconciliationReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${report.mode} reconciliation report to ${config.reconciliationReportPath}`);
  if (args.dryRun) {
    console.log("Dry run complete. No Stripe objects, Subscriptions rows, AllowlistMetadata rows, or Allowlist rows were modified.");
  } else {
    console.log("Apply complete. Subscriptions and AllowlistMetadata were updated; Allowlist rows were not removed or rewritten.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
