// src/analytics/tiktok.js
import { v4 as uuid } from "uuid";

export function track(event, props = {}) {
  const event_id = uuid();
  window.ttq?.track?.(event, { ...props, event_id });
}

export async function identifyUser(email) {
  if (!email) return;
  try {
    const enc = new TextEncoder().encode(email.trim().toLowerCase());
    const buf = await crypto.subtle.digest("SHA-256", enc); // requires HTTPS (which you have)
    const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    window.ttq?.identify?.({ email: hash });
  } catch (_) {
    // silently ignore if hashing not supported
  }
}
