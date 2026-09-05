const QUALIFYING_STATUSES = new Set(["active", "trialing"]);
const GRACE_STATUSES = new Set(["past_due"]);

export function subscriptionQualifies(row, now = new Date()) {
  const status = String(row.status || "").toLowerCase();
  const paidThrough = row.paid_through_date || row.current_period_end;
  const paidThroughMs = paidThrough ? Date.parse(paidThrough) : NaN;

  if (QUALIFYING_STATUSES.has(status)) return true;

  if (status === "canceled" && Number.isFinite(paidThroughMs)) {
    return paidThroughMs > now.getTime();
  }

  if (GRACE_STATUSES.has(status) && Number.isFinite(paidThroughMs)) {
    return paidThroughMs > now.getTime();
  }

  return false;
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
