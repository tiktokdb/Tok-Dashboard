// src/App.jsx
import React, { useEffect, useState } from "react";
import { initGoogle, fetchUserEmail } from "./google";
import LandingPage from "./LandingPage";
import Dashboard from "./Dashboard";
import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY, GOOGLE_SCOPES } from "./config";
import { isAllowedEmail, STAN_URL } from "./allowlist";

export default function App() {
  const [ready, setReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [email, setEmail] = useState(null);
  const [licensed, setLicensed] = useState(false);

  const [error, setError] = useState(null);

  // ---- Google boot/init ----
  useEffect(() => {
    (async () => {
      try {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
          throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_API_KEY in config.js/env");
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

  // ---- Single boot-time auth path (handles hash token + stored token) ----
  useEffect(() => {
    if (!ready || email) return;
    (async () => {
      try {
        // 1) If we just came back from Google, use the hash token
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hashParams.get("access_token");
        if (accessToken) {
          window.gapi?.client?.setToken({ access_token: accessToken });
          // Clean up URL so we don't keep the token in the hash
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // 2) Otherwise restore a valid token from sessionStorage (optional)
          const saved = JSON.parse(sessionStorage.getItem("tokboard_token") || "null");
          if (saved?.access_token && saved?.expires_at > Date.now()) {
            window.gapi?.client?.setToken({ access_token: saved.access_token });
          } else {
            sessionStorage.removeItem("tokboard_token");
          }
        }

        // Try to resolve the user email
        const em = await fetchUserEmail();
        if (em) {
          // ✅ ALLOWLIST CHECK on boot path
          const ok = await isAllowedEmail(em);
          if (!ok) {
            alert("Access requires an active subscription. Redirecting to checkout…");
            window.location.href = STAN_URL;
            return;
          }
          handleSignedIn(em);
        }
      } catch (e) {
        console.log("auth boot check:", e);
      } finally {
        setAuthChecked(true); // done checking; safe to render LandingPage if still signed out
      }
    })();
  }, [ready, email]);

  // ---- Signed-in handler (defensive allowlist check if ever called directly) ----
  async function handleSignedIn(em) {
    try {
      const ok = await isAllowedEmail(em);
      if (!ok) {
        alert("Access requires an active subscription. Redirecting to checkout…");
        window.location.href = STAN_URL;
        return;
      }
      setEmail(em);
      setLicensed(true);
    } catch (e) {
      console.error("Allowlist check failed:", e);
      setError("Failed to verify access.");
    }
  }

  function handleSignOut() {
    window.gapi?.client?.setToken(null);
    sessionStorage.removeItem("tokboard_ssid");
    sessionStorage.removeItem("tokboard_token");
    setEmail(null);
    setLicensed(false);
  }

  // ---- Render states ----
  if (!ready || !authChecked) return <p>Loading…</p>;
  if (!email) return <LandingPage onSignedIn={handleSignedIn} error={error} />;
  if (email && !licensed) return <p>Your email is not on the allowlist yet.</p>;

  return <Dashboard email={email} onSignOut={handleSignOut} />;
}
