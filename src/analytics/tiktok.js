// src/analytics/tiktok.js
import { v4 as uuid } from "uuid"; // npm i uuid

export function track(event, props = {}) {
  const event_id = uuid();
  // Browser (Pixel) event
  window.ttq?.track?.(event, { ...props, event_id });
  // If/when you add a serverless endpoint, POST the same event_id there for de-dupe
}
