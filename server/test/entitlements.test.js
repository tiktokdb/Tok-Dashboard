import test from "node:test";
import assert from "node:assert/strict";
import { aggregateAccess, subscriptionQualifies } from "../src/entitlements.js";

const now = new Date("2026-09-05T00:00:00.000Z");

test("active subscription without scheduled cancellation qualifies", () => {
  assert.equal(subscriptionQualifies({
    status: "active",
    cancel_at_period_end: "false"
  }, now), true);
});

test("active subscription scheduled to cancel in the future qualifies", () => {
  assert.equal(subscriptionQualifies({
    status: "active",
    cancel_at_period_end: "true",
    current_period_end: "2026-10-05T00:00:00.000Z"
  }, now), true);
});

test("active subscription scheduled to cancel at an expired period end does not qualify", () => {
  assert.equal(subscriptionQualifies({
    status: "active",
    cancel_at_period_end: "true",
    current_period_end: "2026-09-05T00:00:00.000Z"
  }, now), false);
});

test("trialing subscription within a future period qualifies", () => {
  assert.equal(subscriptionQualifies({
    status: "trialing",
    current_period_end: "2026-10-05T00:00:00.000Z"
  }, now), true);
});

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
