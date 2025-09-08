// src/LandingPage.jsx
// Put your logo in /public as logo.svg, logo.png, or logo.jpg
// Or set window.__TOKBOARD_LOGO_URL__ in index.html to any image URL

import React, { useEffect, useState } from "react";
import { ensureToken, fetchUserEmail } from "./google";
import { isAllowedEmail, STAN_URL, buildCheckoutUrl } from "./allowlist";


export default function LandingPage({ onSignedIn, error }) {
  const [signingIn, setSigningIn] = useState(false);
  const [logoSrc, setLogoSrc] = useState(null);

  // --- Find a logo automatically (public/logo.* or an override) ---
  useEffect(() => {
    const base = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "") + "/";
    const candidates = [
      typeof window !== "undefined" ? window.__TOKBOARD_LOGO_URL__ : null,
      base + "logo.svg",
      base + "logo.png",
      base + "logo.jpg",
    ].filter(Boolean);

    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) return;
      const url = candidates[i];
      const img = new Image();
      img.onload = () => setLogoSrc(url);
      img.onerror = () => { i += 1; tryNext(); };
      img.src = url;
    };
    tryNext();
  }, []);

  async function handleSignInClick() {
    setSigningIn(true);
    try {
      await ensureToken("consent"); // may redirect

      const tok = window.gapi?.client?.getToken?.();
      if (tok?.access_token) {
        const em = await fetchUserEmail();
        if (em) {
          // NEW: check allowlist
          const ok = await isAllowedEmail(em);
          if (!ok) {
            // Not on allowlist → send to checkout
            alert("Access requires an active subscription. Redirecting to checkout…");
            window.location.href = buildCheckoutUrl(STAN_URL, em);
            return;
          }
          // Allowed → proceed
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

  return (
    <div className="landing">
      {/* scoped styles */}
      <style>{`
        .landing {
          position: relative;
          min-height: 100dvh;
          padding: 8vh 24px 40px;
          display: grid;
          place-items: start center;
          color: #e8ebf1;
          overflow: hidden;
        }
        .landing .fx {
          position: absolute; inset: -20% -10% auto -10%;
          height: 70vh; pointer-events: none; filter: blur(60px); opacity: .6;
          background:
            radial-gradient(40% 40% at 20% 20%, #7c3aed55, transparent 60%),
            radial-gradient(35% 35% at 80% 20%, #22d3ee55, transparent 60%),
            radial-gradient(50% 55% at 50% 90%, #0ea5e955, transparent 60%);
        }
        .wrap { width: min(980px, 100%); position: relative; z-index: 1; text-align: center; }

        .brand { margin-bottom: 18px; }

        .logoBox {
          width: clamp(96px, 14vw, 150px);
          height: clamp(96px, 14vw, 150px);
          margin: 0 auto 14px;
          border-radius: 22px;
          display: grid; place-items: center;
          background: #0f1220;
          border: 1px solid rgba(255,255,255,.08);
          box-shadow:
            0 20px 60px rgba(0,0,0,.45),
            0 0 0 10px rgba(124, 58, 237, .08),
            0 0 120px 30px rgba(34, 211, 238, .06) inset;
        }
        .logo { width: 82%; height: 82%; object-fit: contain; border-radius: 14px; }

        .title {
          margin: 6px 0 6px;
          font-size: clamp(36px, 5.6vw, 56px);
          font-weight: 900;
          letter-spacing: .4px;
          line-height: 1.04;
          background: linear-gradient(180deg, #fff, #bcd2ff);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          text-shadow: 0 2px 30px rgba(34,211,238,.2);
        }
        .tag {
          margin: 0 auto 18px;
          color: #aab3c2;
          font-size: clamp(14px, 1.8vw, 18px);
          max-width: 760px;
        }

        .hero {
          margin: 18px auto 22px;
          padding: clamp(16px, 2.6vw, 24px);
          border-radius: 18px;
          text-align: left;
          border: 1px solid rgba(255,255,255,.10);
          background:
            linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03));
          box-shadow: 0 20px 50px rgba(0,0,0,.35);
        }
        .features { list-style: none; margin: 0; padding: 0; }
        .features li {
          display: flex; gap: 10px; align-items: start;
          padding: 8px 2px;
          font-size: clamp(14px, 1.8vw, 16px);
        }
        .features .dot {
          width: 10px; height: 10px; margin-top: 8px; border-radius: 999px;
          background: linear-gradient(135deg, #7c3aed, #22d3ee);
          box-shadow: 0 0 16px rgba(124,58,237,.7);
          flex: 0 0 auto;
        }
        .features b { color: #fff; }

        .cta {
          margin-top: 8px;
          padding: 14px 22px;
          border-radius: 12px;
          font-weight: 900;
          font-size: 16px;
          border: 1px solid rgba(255,255,255,.12);
          color: #fff;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          box-shadow: 0 12px 30px rgba(6,182,212,.25);
          cursor: pointer;
          transition: transform .12s ease, box-shadow .12s ease, filter .12s ease;
        }
        .cta:hover { transform: translateY(-1px); filter: brightness(1.04); box-shadow: 0 16px 38px rgba(6,182,212,.32); }
        .cta:active { transform: translateY(0); }

        .fine { margin: 14px 0 0; color: #9aa4b2; font-size: 13px; }
        .links { margin-top: 10px; font-size: 13px; color: #93a0b5; }
        .links a { color: inherit; }
        .err { color: #fca5a5; margin-top: 12px; }

        @media (max-width: 520px) {
          .hero { border-radius: 16px; }
          .logoBox { border-radius: 18px; }
        }
      `}</style>

      <div className="fx" aria-hidden="true" />
      <div className="wrap">
        <div className="brand">
          <div className="logoBox">
            {logoSrc ? (
              <img className="logo" src={logoSrc} alt="TokBoard logo" />
            ) : (
              /* subtle placeholder if no logo found */
              <div
                className="logo"
                style={{
                  width: "82%", height: "82%", borderRadius: 14,
                  background: "radial-gradient(circle at 30% 30%, #7c3aed, #22d3ee)"
                }}
              />
            )}
          </div>

          <h1 className="title">TokBoard</h1>
          <p className="tag">
            Track creator products & posts — powered by your own Google Sheet.
          </p>
        </div>

        <section className="hero">
          <ul className="features">
            <li><span className="dot" /> Log products with brand, status, deliverables, due dates, costs, links, and notes.</li>
            <li><span className="dot" /> Instant KPIs: <b>purchased</b>,<b>unreimbursed</b>,and<b>gifted/reimbursed</b> value.</li>
            <li><span className="dot" /> <b>Your data stays in your Google account</b> (we don’t store your spreadsheet).</li>
            <li><span className="dot" /> <i>Coming soon:</i> Brand Deals & Requests.</li>
          </ul>
        </section>

        <button className="cta" onClick={handleSignInClick} disabled={signingIn}>
          {signingIn ? "Redirecting…" : "Sign in with Google"}
        </button>

        {error && <p className="err">{error}</p>}

        <p className="fine">
          Founding price planned: <b>$19.99/year</b> (regular <b>$29.99/year</b>).
        </p>

        <p className="links">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          {" · "}
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>
        </p>
      </div>
    </div>
  );
}
