const USAGE_URL = import.meta.env.VITE_USAGE_ENDPOINT;

let timer = null;
let seconds = 0;
let sessionId = null;
let currentEmail = null;

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
  currentEmail = String(email||'').trim().toLowerCase();
  sessionId = (crypto?.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  seconds = 0;

  const base = () => ({
    email: currentEmail,
    session_id: sessionId,
    ua: navigator.userAgent,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sw: screen.width, sh: screen.height,
    ref: document.referrer,
    page: location.pathname
  });

  post({ ...base(), event: 'login', seconds });

  document.addEventListener('visibilitychange', () => {
    post({ ...base(), event: visible() ? 'visible' : 'hidden', seconds });
  });

  window.addEventListener('beforeunload', () => {
    try {
      const payload = JSON.stringify({ ...base(), event: 'logout', seconds });
      navigator.sendBeacon(USAGE_URL, payload);
    } catch(_) {}
  });

  timer = setInterval(() => {
    if (visible()) {
      seconds += 15;
      post({ ...base(), event: 'heartbeat', seconds });
    }
  }, 15000);
}

export function stopUsage(){
  if (timer) clearInterval(timer);
  timer = null;
}
