import React, { useEffect, useState } from "react";
import { initGoogle, fetchUserEmail, findOrCreateSpreadsheet } from "./google";
import LandingPage from "./LandingPage";
import Dashboard from "./Dashboard";
import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY, GOOGLE_SCOPES } from "./config";
import { isAllowedEmail } from "./allowlist";
import { startUsage, stopUsage } from "./usage";

export default function App() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState(null);
  const [licensed, setLicensed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState(null);
  const [ssid, setSsid] = useState(null);

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

  function signOut() {
    try { stopUsage(); } catch {}
    try { window.gapi?.client?.setToken(null); } catch {}
    sessionStorage.removeItem("tokboard_token");
    sessionStorage.removeItem("tokboard_ssid");
    setEmail(null);
    setLicensed(false);
    setSsid(null);
  }

  // called by LandingPage after Google sign-in completes
  async function handleSignedIn(em) {
    const ok = await isAllowedEmail(em);
    if (!ok) {
      alert("Access requires an active subscription. Please choose a plan on the landing page.");
      signOut();
      return;
    }
    setEmail(em);
    setLicensed(true);
    startUsage(em);

    // find/create sheet — NO redirect; Dashboard will embed it
    const id = await findOrCreateSpreadsheet();
    setSsid(id);
  }

  function handleSignOut() {
    try { stopUsage(); } catch {}
    try { window.gapi?.client?.setToken(null); } catch {}
    sessionStorage.removeItem("tokboard_token");
    sessionStorage.removeItem("tokboard_ssid");
    setEmail(null);
    setLicensed(false);
    setSsid(null);
  }

  // boot-time auth check
  useEffect(() => {
    if (!ready || email) return;
    (async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        if (accessToken) {
          window.gapi?.client?.setToken({ access_token: accessToken });
          window.history.replaceState({}, document.title, window.location.pathname);
          sessionStorage.setItem(
            "tokboard_token",
            JSON.stringify({ access_token: accessToken, saved_at: Date.now() })
          );
        } else {
          const saved = JSON.parse(sessionStorage.getItem("tokboard_token") || "null");
          if (saved?.access_token) {
            window.gapi?.client?.setToken({ access_token: saved.access_token });
          } else {
            sessionStorage.removeItem("tokboard_token");
          }
        }

        const em = await fetchUserEmail();
        if (em) {
          const ok = await isAllowedEmail(em);
          if (!ok) {
            signOut();
            return;
          }
          setEmail(em);
          setLicensed(true);
          startUsage(em);

          const id = await findOrCreateSpreadsheet();
          setSsid(id); // Dashboard will embed
        }
      } catch (e) {
        console.log("auth boot check:", e);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [ready, email]);

  if (!ready || !authChecked) return <p>Loading…</p>;
  if (!email) return <LandingPage onSignedIn={handleSignedIn} error={error} />;
  if (email && !licensed) return <p>Your email is not on the allowlist yet.</p>;
  return <Dashboard email={email} ssid={ssid} onSignOut={handleSignOut} />;
}
