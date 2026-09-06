const QUALIFYING_STATUSES = new Set(["active", "trialing"]);

export function parseEntitlementTime(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();

  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }

  return Date.parse(raw);
}

export function subscriptionQualifies(row, now = new Date()) {
  const status = String(row.status || "").toLowerCase();
  const paidThrough = row.paid_through_date || row.current_period_end;
  const paidThroughMs = parseEntitlementTime(paidThrough);
  const cancelAtPeriodEnd = String(row.cancel_at_period_end || "").toLowerCase() === "true";

  if (status === "trialing") {
    return Number.isFinite(paidThroughMs) ? paidThroughMs > now.getTime() : true;
  }
  if (status === "active" && cancelAtPeriodEnd) {
    return Number.isFinite(paidThroughMs) && paidThroughMs > now.getTime();
  }
  return QUALIFYING_STATUSES.has(status);
}

export function aggregateAccess(rows, now = new Date()) {
  const qualifying = rows.filter((row) => subscriptionQualifies(row, now));
  return {
    hasAccess: qualifying.length > 0,
    activeSubscriptionCount: qualifying.length,
    accessUntil: qualifying
      .map((row) => row.paid_through_date || row.current_period_end)
      .filter(Boolean)
      .sort()
      .at(-1) || ""
  };
}
