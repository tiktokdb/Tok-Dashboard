import test from "node:test";
import assert from "node:assert/strict";
import { aggregateAccess } from "../src/entitlements.js";

const now = new Date("2026-09-05T00:00:00.000Z");

test("keeps access when any subscription still qualifies", () => {
  const result = aggregateAccess([
    { status: "canceled", paid_through_date: "2026-01-01T00:00:00.000Z" },
    { status: "active", paid_through_date: "2026-12-01T00:00:00.000Z" }
  ], now);

  assert.equal(result.hasAccess, true);
  assert.equal(result.activeSubscriptionCount, 1);
});

test("does not qualify canceled subscriptions even with a future paid-through date", () => {
  const result = aggregateAccess([
    { status: "canceled", paid_through_date: "2026-10-01T00:00:00.000Z" }
  ], now);

  assert.equal(result.hasAccess, false);
});

test("does not qualify fully expired canceled subscriptions", () => {
  const result = aggregateAccess([
    { status: "canceled", paid_through_date: "2026-01-01T00:00:00.000Z" }
  ], now);

  assert.equal(result.hasAccess, false);
});
