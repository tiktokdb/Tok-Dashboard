// src/LandingPage.jsx
// Put your logo in /public as logo.svg, logo.png, or logo.jpg
// Or set window.__TOKBOARD_LOGO_URL__ in index.html to any image URL

import React, { useEffect, useState } from "react";
import { ensureToken, fetchUserEmail } from "./google";
import { isAllowedEmail, STRIPE_LINK_MONTHLY, STRIPE_LINK_YEARLY } from "./allowlist";


export default function LandingPage({ onSignedIn, error }) {
  const [signingIn, setSigningIn] = useState(false);
  const [logoSrc, setLogoSrc] = useState(null);
  const [notAllowed, setNotAllowed] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  // --- Lightbox state + data ---
  const [lightboxIndex, setLightboxIndex] = useState/** @type {number|null} */(null);

  const peekImages = [
    { src: "/tokboard_crop_kpis.png",    alt: "TokBoard KPI cards",               caption: "At-a-glance KPIs" },
    { src: "/tokboard_crop_filters.png", alt: "TokBoard filters & quick actions", caption: "Filters & quick actions" },
    { src: "/tokboard_crop_table.png",   alt: "TokBoard product tracker table",   caption: "Product tracker table" },
  ];

  const imgCount = peekImages.length;

  // Keyboard controls when lightbox is open: ESC to close, ←/→ to navigate
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i + 1) % imgCount);
      if (e.key === "ArrowLeft")  setLightboxIndex((i) => (i - 1 + imgCount) % imgCount);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, imgCount]);

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
             // Not on allowlist → keep them on landing and show pricing
             setNotAllowed(true);
             setSigningIn(false);
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
          display: flex;
          gap: 10px;
          align-items: flex-start; /* <- this is the fix */
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

        /* --- Sneak Peek gallery --- */
        .peek { 
          margin: 28px auto 8px; 
          text-align: center; 
          max-width: 980px; 
        }
        .peek-title {
          font-size: clamp(22px, 3.2vw, 28px);
          font-weight: 900;
          margin: 0 0 4px;
          background: linear-gradient(180deg, #fff, #bcd2ff);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .peek-sub { 
          color: #aab3c2; 
          margin: 0 0 16px; 
          font-size: 14px; 
        }
        .peek-grid {
          display: grid; 
          gap: 14px; 
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 900px) { .peek-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .peek-grid { grid-template-columns: 1fr; } }

        .peek-card {
          margin: 0; 
          padding: 10px; 
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
          box-shadow: 0 14px 36px rgba(0,0,0,.35);
          transition: transform .14s ease, box-shadow .14s ease, filter .14s ease;
        }
        .peek-card:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 20px 48px rgba(0,0,0,.45); 
          filter: brightness(1.03);
        }
        .peek-card img { 
          width: 100%; 
          border-radius: 10px; 
          display: block; 
        }
        .peek-card figcaption { 
          margin-top: 8px; 
          font-size: 13px; 
          color: #93a0b5; 
        }

        /* Make cards feel clickable */
        .peek-card { cursor: zoom-in; }
        .peek-card:focus { outline: 2px solid rgba(124,58,237,.6); outline-offset: 2px; }

        /* --- Lightbox overlay --- */
        .lightbox {
        position: fixed; inset: 0; z-index: 50;
        background: rgba(0,0,0,.70);           /* darker backdrop for contrast */
        backdrop-filter: blur(4px);
        display: grid; place-items: center;
        padding: 16px;
      }
      .lightbox-content {
        position: relative;
        max-width: min(1400px, 98vw);           /* wider container */
        max-height: 90vh;                        /* keep on screen */
        width: 100%;
        overflow: hidden;                        /* needed for zoom */
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 16px;
        box-shadow: 0 30px 80px rgba(0,0,0,.65);
        padding: 12px 54px;                      /* a bit less padding = more room */
      }
      .lightbox-img {
        display: block;
        margin: 0 auto;
        max-width: 100%;
        height: auto;
        max-height: 78vh;                        /* grow to tall, stay readable */
        border-radius: 10px;
      }

        /* Close + nav buttons */
        .lightbox-close {
          position: absolute; top: 8px; right: 10px;
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(15,18,32,.7);
          color: #e8ebf1; border: 1px solid rgba(255,255,255,.12);
          font-size: 22px; line-height: 32px; cursor: pointer;
        }
        .lightbox-nav {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 42px; height: 42px; border-radius: 999px;
          background: rgba(15,18,32,.72);
          color: #e8ebf1; border: 1px solid rgba(255,255,255,.12);
          font-size: 26px; line-height: 36px; cursor: pointer;
        }
        .lightbox-nav.prev { left: 10px; }
        .lightbox-nav.next { right: 10px; }
        .lightbox-close:hover, .lightbox-nav:hover { filter: brightness(1.08); }
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
            <li><span className="dot" /><span>Instant KPIs: <b>purchased,</b> <b>unreimbursed,</b> and <b>gifted/reimbursed</b> value.</span></li>
            <li><span className="dot" /> <b>Your data stays in your Google account</b> (we don’t store your spreadsheet).</li>
          </ul>
        </section>

        <section className="peek">
        <h2 className="peek-title">Sneak peek</h2>
        <p className="peek-sub">A quick look at KPIs, filters, and the tracker table.</p>

        <div className="peek-grid">
          {peekImages.map((img, i) => (
            <figure
              key={i}
              className="peek-card"
              onClick={() => setLightboxIndex(i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setLightboxIndex(i)}
              aria-label={`Open preview: ${img.caption}`}
            >
              <img loading="lazy" src={img.src} alt={img.alt} />
              <figcaption>{img.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

        <button className="cta" onClick={handleSignInClick} disabled={signingIn}>
          {signingIn ? "Redirecting…" : "Sign in with Google"}
        </button>

        {/* NEW: info about the unverified app screen */}
        <p className="fine" style={{ marginTop: "12px", color: "#fbbf24" }}>
          ⚠️ First time signing in? Google may show a warning that says 
          <i>“Google hasn’t verified this app.”</i><br />
          Just click <b>Advanced → Go to tokboard.com (unsafe)</b>
          to continue. You’ll only need to do this once while we’re waiting 
          on Google’s verification.
        </p>

        <p className="fine" style={{ marginTop: 8 }}>
          Not on the allowlist?{" "}
          <button
            type="button"
            onClick={() => setShowPlans((s) => !s)}
            style={{
              background: "none",
              border: "none",
              color: "#93a0b5",
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0
            }}
          >
            {showPlans ? "Hide plans" : "See plans"}
          </button>
        </p>

        {error && <p className="err">{error}</p>}

        {(notAllowed || showPlans) && (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: "#aab3c2", marginBottom: 8 }}>
              {notAllowed
                ? "Don’t have access yet? Choose a plan to unlock TokBoard:"
                : "Plans"}
            </p>
            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "1fr 1fr",
                maxWidth: 520,
                margin: "10px auto 0"
              }}
            >
              <a className="cta" style={{ textAlign: "center" }} href={STRIPE_LINK_MONTHLY}>
                $5.99 / month
              </a>
              <a className="cta" style={{ textAlign: "center" }} href={STRIPE_LINK_YEARLY}>
                $39.99 / year
              </a>
            </div>
            <p className="fine">
              After checkout, return here and sign in again—access unlocks automatically
              once your email is on the allowlist.
            </p>
          </div>
        )}

        <p className="links">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          {" · "}
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>
        </p>
      </div>

      {lightboxIndex !== null && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="lightbox-close"
              onClick={() => setLightboxIndex(null)}
              aria-label="Close"
            >
              {"X"}
            </button>

            <button
              className="lightbox-nav prev"
              onClick={() => setLightboxIndex((i) => (i - 1 + peekImages.length) % peekImages.length)}
              aria-label="Previous"
            >
              {"<"}
            </button>

            <img
              className="lightbox-img"
              src={peekImages[lightboxIndex].src}
              alt={peekImages[lightboxIndex].alt}
            />

            <div className="lightbox-caption">
              {peekImages[lightboxIndex].caption}
            </div>

            <button
              className="lightbox-nav next"
              onClick={() => setLightboxIndex((i) => (i + 1) % peekImages.length)}
              aria-label="Next"
            >
              {">"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

