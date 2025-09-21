// src/Dashboard.jsx
import React, { useMemo, useRef, useState } from "react";
import Products from "./tabs/Products";
import BrandDeals from "./tabs/BrandDeals";
import { initSheetStructure } from "./google";

const TABS = [
  { key: "products", label: "Products" },
  { key: "branddeals", label: "Brand Deals" },
];

export default function Dashboard({ email, ssid, onSignOut }) {
  const [tab, setTab] = useState("products");
  const didInitRef = useRef(false);

  const TabComp = useMemo(() => {
    switch (tab) {
      case "products": return Products;
      case "branddeals": return BrandDeals;
      default: return Products;
    }
  }, [tab]);

  async function handleIframeLoad() {
    if (!ssid) return;
    // Run once per mount to avoid loops
    if (didInitRef.current) return;
    didInitRef.current = true;

    try {
      // Now the spreadsheet is “current” for this user session.
      // Create our tabs (if missing), write headers, then delete all non-TokBoard tabs (e.g., “Sheet1”).
      await initSheetStructure(ssid);
    } catch (e) {
      console.warn("initSheetStructure failed:", e?.message || e);
      // If you want a retry on slow loads, uncomment:
      // setTimeout(() => { didInitRef.current = false; handleIframeLoad(); }, 800);
    }
  }

  return (
    <>
      {/* Top bar */}
      <div className="tb" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <div className="brand">
          <span className="dot" /> TokBoard
          <span className="muted" style={{ marginLeft: 8 }}>for Creators</span>
        </div>

        {/* Tabs hidden while sheet is embedded to maximize space */}
        {!ssid && (
          <div className="chips">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`chip ${tab === t.key ? "active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {ssid && (
            <a
              className="btn"
              href={`https://docs.google.com/spreadsheets/d/${ssid}/edit`}
              target="_blank"
              rel="noreferrer"
              title="Open your Google Sheet in a new tab"
            >
              Open in Google Sheets
            </a>
          )}
          <span className="muted">Signed in as <b>{email}</b></span>
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {/* Page content */}
      <div className="page" style={{ padding: 0 }}>
        {ssid ? (
          // ✅ Embed the Sheet IN the dashboard
          <iframe
            key={ssid}
            src={`https://docs.google.com/spreadsheets/d/${ssid}/edit?rm=embedded`}
            style={{
              width: "100%",
              height: "calc(100vh - 64px)",
              border: 0,
            }}
            allow="clipboard-read; clipboard-write"
            title="TokBoard Sheet"
            onLoad={handleIframeLoad}
          />
        ) : (
          // Fallback to local tabs if no sheet yet
          <div style={{ padding: 24 }}>
            <div className="chips" style={{ marginBottom: 16 }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`chip ${tab === t.key ? "active" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <TabComp />
          </div>
        )}
      </div>
    </>
  );
}
