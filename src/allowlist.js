// src/allowlist.js
import { GOOGLE_API_KEY } from "./config";

const SSID = import.meta.env.VITE_ALLOWLIST_SSID || "";
export const STAN_URL = import.meta.env.VITE_STAN_URL || "https://stan.store/";

const TTL_MS = 5 * 60 * 1000; // cache 5 min
const CACHE_KEY = "tokboard_allowlist_v1";

/* Gmail-safe normalization + lowercasing */
function normEmail(e) {
  if (!e) return "";
  let [local, domain] = String(e).trim().toLowerCase().split("@");
  if (!domain) return String(e).trim().toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0].replace(/\./g, "");
    domain = "gmail.com";
  } else {
    local = local.split("+")[0];
  }
  return `${local}@${domain}`;
}

/* Support lines like "@brand.com" to allow an entire domain */
function matchAllowed(email, items) {
  const ne = normEmail(email);
  for (const raw of items) {
    const v = String(raw || "").trim().toLowerCase();
    if (!v) continue;
    if (v.startsWith("@")) {
      if (ne.endsWith(v)) return true; // domain rule
    } else if (normEmail(v) === ne) {
      return true;                     // exact email
    }
  }
  return false;
}

function getCache() {
  try {
    const x = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (x && Date.now() - x.t < TTL_MS) return x.items;
  } catch {}
  return null;
}
function setCache(items) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items })); } catch {}
}

export async function fetchAllowlist() {
  if (!SSID) return [];
  const cached = getCache();
  if (cached) return cached;

  // A2:A skips a possible "email" header in A1
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SSID}` +
    `/values/Allowlist!A2:A?key=${encodeURIComponent(GOOGLE_API_KEY)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Allowlist fetch failed");
  const json = await res.json();
  const items = (json.values || [])
    .flat()
    .map(s => String(s).trim())
    .filter(Boolean);

  setCache(items);
  return items;
}

export async function isAllowedEmail(email) {
  if (!SSID) return true;  // if no sheet configured, allow everyone
  const list = await fetchAllowlist();
  return matchAllowed(email, list);
}

export function buildCheckoutUrl(base, email) {
  try {
    const u = new URL(base);
    if (email) u.searchParams.set("email", email);
    return u.toString();
  } catch {
    return base;
  }
}
