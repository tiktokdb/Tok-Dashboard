import { GOOGLE_API_KEY } from "./config";

const SSID = import.meta.env.VITE_ALLOWLIST_SSID || "";
export const STAN_URL = import.meta.env.VITE_STAN_URL || "https://stan.store/";

export async function isAllowedEmail(email) {
  if (!SSID) return true; // no sheet configured = allow everyone
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SSID}` +
    `/values/Allowlist!A:A?key=${encodeURIComponent(GOOGLE_API_KEY)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Allowlist fetch failed");
  const json = await res.json();
  const list = (json.values || [])
    .flat()
    .map(x => String(x).trim().toLowerCase())
    .filter(Boolean);

  return list.includes(String(email).trim().toLowerCase());
}
