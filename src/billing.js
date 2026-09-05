import { getAccessToken } from "./google";

const BILLING_API_BASE = (import.meta.env.VITE_BILLING_API_BASE || "").replace(/\/+$/, "");

export async function openCustomerPortal() {
  if (!BILLING_API_BASE) {
    throw new Error("Billing is not configured yet.");
  }

  const token = getAccessToken();
  if (!token) {
    throw new Error("Please sign in again before managing billing.");
  }

  const res = await fetch(`${BILLING_API_BASE}/api/billing/portal`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Could not open billing portal.");
  }

  window.location.assign(data.url);
}
