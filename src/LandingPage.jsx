// src/LandingPage.jsx
// Put your logo in /public as logo.svg, logo.png, or logo.jpg
// Or set window.__TOKBOARD_LOGO_URL__ in index.html to any image URL

import React, { useEffect, useState } from "react";
import { ensureToken, fetchUserEmail } from "./google";

export default function LandingPage({ onSignedIn, error }) {
  const [signingIn, setSigningIn] = useState(false);
  const [logoSrc, setLogoSrc] = useState(null);

  // Try to find a logo automatically
  useEffect(() => {
    const candidates = [
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
    setSigningIn(true);
    try {
      await ensureToken("consent"); // triggers Google redirect if needed

      const tok = window.gapi?.client?.getToken?.();
      if (tok?.access_token) {
        const em = await fetchUserEmail();
        if (em) {
          onSignedIn?.(em);
          setSigningIn(false);
          return;
        }
      }
    } catch (err) {
      console.error("Sign-in error:", err);
    } finally {
      setSigningIn(false);
    }
  }

  // --- styles (inline so no CSS changes needed) ---
  const wrap = {
    maxWidth: 860,
    margin: "72px auto 48px",
    padding: "0 20px",
    textAlign: "center",
  };
  const logoStyle = {
    width: 64, height: 64, objectFit: "contain", marginBottom: 14,
    filter: "drop-shadow(0 4px 18px rgba(0,0,0,.35))",
  };
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
        <div
          style={{
            ...logoStyle,
            width: 56, height: 56, borderRadius: 12,
            background: "radial-gradient(circle at 30% 30%, #7c3aed, #22d3ee)"
          }}
        />
      )}

      <h1 style={h1}>TokBoard</h1>
      <p style={sub}>
        Track creator products & posts — powered by your own Google Sheet.
      </p>

      <div style={heroCard}>
        <ul style={list}>
          <li>Log products with brand, status, deliverables, due dates, costs, links, and notes.</li>
          <li>Instant KPIs: <b>purchased</b>, <b>unreimbursed</b>, and <b>gifted/reimbursed</b> value.</li>
          <li><b>Your data stays in your Google account</b> (we don’t store your spreadsheet).</li>
          <li><i>Coming soon:</i> Brand Deals & Requests.</li>
        </ul>
      </div>

      <button onClick={handleSignInClick} disabled={signingIn} style={btn}>
        {signingIn ? "Redirecting…" : "Sign in with Google"}
      </button>

      {error && <p style={{ color: "#fca5a5", marginTop: 12 }}>{error}</p>}

      <p style={foot}>
        Founding price planned: <b>$19.99/year</b> (regular <b>$29.99/year</b>).
      </p>

      <p style={{ marginTop: 10 }}>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
        {" · "}
        <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>
      </p>
    </div>
  );
}
