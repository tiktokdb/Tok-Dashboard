// src/usage.js
const USAGE_URL = import.meta.env.VITE_USAGE_ENDPOINT;

let timer = null;
let seconds = 0;
let sessionId = null;
let currentEmail = null;

let started = false;        // ✅ prevent double starts in one tab
let visHandler = null;      // ✅ keep refs so we can remove
let unloadHandler = null;
let activityHandler = null;

let lastActivity = Date.now();                 // ✅ idle detector
let lastVisState = document.visibilityState;   // ✅ avoid dup vis/hidden

function post(obj){
  if (!USAGE_URL) return;
  try {
    return fetch(USAGE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(obj),
      keepalive: true
    });
  } catch (_) {}
}

function visible(){ return document.visibilityState === 'visible'; }

export function startUsage(email){
  if (!USAGE_URL) return;
  if (started) return;       // ✅ don’t attach twice
  started = true;

  currentEmail = String(email||'').trim().toLowerCase();
  sessionId = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  seconds = 0;
  lastActivity = Date.now();
  lastVisState = document.visibilityState;

  const base = () => ({
    email: currentEmail,
    session_id: sessionId,
    ua: navigator.userAgent,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sw: screen.width, sh: screen.height,
    ref: document.referrer,
    page: location.pathname
  });

  // first ping
  post({ ...base(), event: 'login', seconds });

  // visibility changes (dedup if same state fires twice)
  visHandler = () => {
    const nowState = visible() ? 'visible' : 'hidden';
    if (nowState !== lastVisState) {
      lastVisState = nowState;
      post({ ...base(), event: nowState, seconds });
    }
  };
  document.addEventListener('visibilitychange', visHandler, { passive: true });

  // recent activity = user is not idle
  activityHandler = () => { lastActivity = Date.now(); };
  window.addEventListener('mousemove', activityHandler, { passive: true });
  window.addEventListener('keydown',   activityHandler, { passive: true });
  window.addEventListener('scroll',    activityHandler, { passive: true });
  window.addEventListener('click',     activityHandler, { passive: true });

  // tab closing / nav away
  unloadHandler = () => {
    try {
      const payload = JSON.stringify({ ...base(), event: 'logout', seconds });
      navigator.sendBeacon(USAGE_URL, payload);
    } catch(_) {}
  };
  window.addEventListener('beforeunload', unloadHandler, { passive: true });

  // heartbeat (every 15s) — only when foreground AND not idle > 60s
  timer = setInterval(() => {
    if (!visible()) return;
    const idleMs = Date.now() - lastActivity;
    if (idleMs <= 60_000) {
      seconds += 15;
      post({ ...base(), event: 'heartbeat', seconds });
    }
  }, 15000);
}

export function stopUsage(){
  if (timer) clearInterval(timer);
  timer = null;

  if (visHandler) document.removeEventListener('visibilitychange', visHandler);
  if (unloadHandler) window.removeEventListener('beforeunload', unloadHandler);
  if (activityHandler) {
    window.removeEventListener('mousemove', activityHandler);
    window.removeEventListener('keydown',   activityHandler);
    window.removeEventListener('scroll',    activityHandler);
    window.removeEventListener('click',     activityHandler);
  }
  visHandler = null;
  unloadHandler = null;
  activityHandler = null;
  started = false;
}
