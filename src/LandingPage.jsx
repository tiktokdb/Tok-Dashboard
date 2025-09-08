// src/LandingPage.jsx
// Tip: add your logo to /public as logo.svg, logo.png, or logo.jpg.
// (Optional) You can also set window.__TOKBOARD_LOGO_URL__ in index.html to any image URL.

import React, { useEffect, useState } from "react";
import { ensureToken, fetchUserEmail } from "./google";

export default function LandingPage({ onSignedIn, error }) {
  const [signingIn, setSigningIn] = useState(false);
  const [logoSrc, setLogoSrc] = useState(null);

  // --- Find a logo automatically (public/logo.* or an override) ---
  useEffect(() => {
    const candidates = [
      // allow an override via window var if you ever want to set it in index.html
      typeof window !== "undefined" ? window.__TOKBOARD_LOGO_URL__ : null,
      "/logo.svg",
      "/logo.png",
      "/logo.jpg",
    ].filter(Boolean);

    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) return;
      const img = new Image();
      img.onload = () => setLogoSrc(candidates[i]);
      img.onerror = () => { i += 1; tryNext(); };
      img.src = candidates[i];
    };
    tryNext();
  }, []);

  async function handleSignInClick() {
    console.log("🖱️ Sign-In (redirect mode)");
    setSigningIn(true);
    try {
      await ensureToken("consent"); // triggers Google redirect if needed

      // If Google returned a token immediately (no redirect), finish sign-in now
      const tok = window.gapi?.client?.getToken?.();
      if (tok?.access_token) {
        console.log("✅ Access token present; fetching email…");
        const em = await fetchUserEmail();
        if (em) {
          console.log("✅ Immediate sign-in; notifying App:", em);
          onSignedIn?.(em);
          setSigningIn(false);
          return;
        } else {
          console.warn("⚠️ Token present but no email from userinfo");
        }
      } else {
        console.log("↪️ Redirect expected (no immediate token).");
      }

      console.log("↪️ Redirecting to Google…");
    } catch (err) {
      console.error("❌ Sign-in error:", err);
    } finally {
      setSigningIn(false);
    }
  }

  return (
  <div style={{ textAlign: "center", marginTop: 100 }}>
    <h1>Welcome to TokBoard</h1>
    <p>Please sign in with Google to continue.</p>

    <button
      onClick={handleSignInClick}
      disabled={signingIn}
      style={{ padding: "12px 20px", borderRadius: 8, fontWeight: 700 }}
    >
      {signingIn ? "Redirecting…" : "Sign in with Google"}
    </button>

    {/* --- founder blurb (sneak peek) --- */}
    <div
      style={{
        margin: "28px auto 0",
        textAlign: "left",
        width: "min(720px, 92vw)",
        padding: 16,
        border: "1px solid rgba(0,0,0,.1)",
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02))",
      }}
    >
      <h3 style={{ marginTop: 0 }}>What TokBoard does (today)</h3>
      <ul style={{ marginTop: 8, lineHeight: 1.6 }}>
        <li>Track products you buy or get for free, with status + due dates.</li>
        <li>Auto-totals: <b>purchased</b>, <b>unreimbursed</b>, and <b>gifted/reimbursed value</b>.</li>
        <li>Your data lives in <b>your</b> Google Sheets. No server database.</li>
      </ul>
      <p style={{ marginTop: 10 }}>
        <b>Coming soon:</b> Brand Deals & Requests tabs.
      </p>
      <p style={{ marginTop: 8 }}>
        <b>Founding plan:</b> <u>$19.99/yr</u> (grandfathered). Public price will be <u>$29.99/yr</u>.
      </p>
    </div>

    {/* footer links */}
    <p style={{ marginTop: 18 }}>
      <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
      {" · "}
      <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>
    </p>

    {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}
  </div>
)

  // --- styles (inline so you don't have to touch CSS files) ---
  const wrap = {
    maxWidth: 860,
    margin: "72px auto 48px",
    padding: "0 20px",
    textAlign: "center",
  };
  const logoStyle = { width: 64, height: 64, objectFit: "contain", marginBottom: 14, filter: "drop-shadow(0 4px 18px rgba(0,0,0,.35))" };
  const h1 = { fontSize: 36, margin: "0 0 8px", fontWeight: 800, letterSpacing: .3 };
  const sub = { margin: "0 0 22px", color: "#9aa4b2", fontSize: 16 };
  const heroCard = {
    margin: "22px auto",
    padding: "18px 18px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02))",
    boxShadow: "0 10px 30px rgba(0,0,0,.25)",
    textAlign: "left",
  };
  const list = { margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 15 };
  const btn = {
    padding: "12px 20px",
    borderRadius: 10,
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,.08)",
    background: "linear-gradient(135deg, #7c3aed, #22d3ee)",
    color: "white",
    cursor: "pointer",
    marginTop: 14,
  };
  const foot = { marginTop: 18, color: "#9aa4b2", fontSize: 13 };

  return (
    <div style={wrap}>
      {logoSrc ? (
        <img src={logoSrc} alt="TokBoard logo" style={logoStyle} />
      ) : (
        <div style={{ ...logoStyle, width: 56, height: 56, borderRadius: 12, background: "radial-gradient(circle at 30% 30%, #7c3aed, #22d3ee)" }} />
      )}

      <h1 style={h1}>TokBoard</h1>
      <p style={sub}>The simplest way to track creator products and posts — powered by your own Google Sheet.</p>

      <div style={heroCard}>
        <ul style={list}>
          <li>Log products with brand, status, deliverables, due dates, costs, links, and notes.</li>
          <li>See instant KPIs: Purchased vs Free/Reimbursed, Filming count, and total Posted.</li>
          <li><b>Your data stays in your Google account</b> (we don’t store your spreadsheet).</li>
          <li><i>Coming soon:</i> Brand Deals, Requests, and revenue tracking.</li>
        </ul>
      </div>

      <button onClick={handleSignInClick} disabled={signingIn} style={btn}>
        {signingIn ? "Redirecting…" : "Sign in with Google"}
      </button>

      {error && <p style={{ color: "#fca5a5", marginTop: 12 }}>{error}</p>}

      <p style={foot}>
        Founding price planned: <b>$19.99/year</b> (regular <b>$29.99/year</b>). Early access while we finish Brand Deals/Requests.
      </p>

      <p style={{ marginTop: 10 }}>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
        {" · "}
        <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>
      </p>
    </div>
  );
}
