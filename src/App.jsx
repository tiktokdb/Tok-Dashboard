// src/App.jsx
import React, { useEffect, useState } from "react";
import { initGoogle, fetchUserEmail } from "./google";
import LandingPage from "./LandingPage";
import Dashboard from "./Dashboard";
import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY, GOOGLE_SCOPES } from "./config";
import { isAllowedEmail, STAN_URL } from "./allowlist";

export default function App() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState(null);
  const [licensed, setLicensed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState(null);

  // --- init Google ---
  useEffect(() => {
    (async () => {
      try {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
          throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_API_KEY in config.js");
        }
        await initGoogle({
          apiKey: GOOGLE_API_KEY,
          clientId: GOOGLE_CLIENT_ID,
          scopes: GOOGLE_SCOPES,
        });
      } catch (e) {
        console.error("❌ Google init failed:", e);
        setError(e?.message || "Failed to init Google");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // --- helper: clear token + bounce to checkout ---
  function signOutAndRedirect() {
    try { window.gapi?.client?.setToken(null); } catch {}
    sessionStorage.removeItem("tokboard_token");
    sessionStorage.removeItem("tokboard_ssid");
    setEmail(null);
    setLicensed(false);
    window.location.href = STAN_URL;
  }

  // --- called by LandingPage after Google sign-in completes ---
  async function handleSignedIn(em) {
    // Guard with allowlist every time
    const ok = await isAllowedEmail(em);
    if (!ok) {
      alert("Access requires an active subscription. Redirecting to checkout…");
      signOutAndRedirect();
      return;
    }
    setEmail(em);
    setLicensed(true);
  }

  function handleSignOut() {
    try { window.gapi?.client?.setToken(null); } catch {}
    sessionStorage.removeItem("tokboard_token");
    sessionStorage.removeItem("tokboard_ssid");
    setEmail(null);
    setLicensed(false);
  }

  // --- boot-time auth check: restore token, resolve user, THEN allowlist-check ---
  useEffect(() => {
    if (!ready || email) return;
    (async () => {
      try {
        // 1) If we just came back from Google, use the hash token
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        if (accessToken) {
          window.gapi?.client?.setToken({ access_token: accessToken });
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          // optional: persist for this browser session
          sessionStorage.setItem("tokboard_token", JSON.stringify({
            access_token: accessToken, // no expiry guaranteed here, but fine for session restore
            saved_at: Date.now(),
          }));
        } else {
          // 2) Otherwise restore a token we saved earlier (sessionStorage)
          const saved = JSON.parse(sessionStorage.getItem("tokboard_token") || "null");
          if (saved?.access_token) {
            window.gapi?.client?.setToken({ access_token: saved.access_token });
          } else {
            sessionStorage.removeItem("tokboard_token");
          }
        }

        // Resolve current user
        const em = await fetchUserEmail();
        if (em) {
          // ALLOWLIST right here at boot
          const ok = await isAllowedEmail(em);
          if (!ok) {
            alert("Access requires an active subscription. Redirecting to checkout…");
            signOutAndRedirect();
            return;
          }
          setEmail(em);
          setLicensed(true);
        }
      } catch (e) {
        console.log("auth boot check:", e);
      } finally {
        setAuthChecked(true); // ✅ safe to render LandingPage if still signed out
      }
    })();
  }, [ready, email]);

  if (!ready || !authChecked) return <p>Loading…</p>;
  if (!email) return <LandingPage onSignedIn={handleSignedIn} error={error} />;
  if (email && !licensed) return <p>Your email is not on the allowlist yet.</p>;
  return <Dashboard email={email} onSignOut={handleSignOut} />;
}
