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

  async function handleHiddenIframeLoad() {
    if (!ssid) return;
    if (didInitRef.current) return; // run once per mount
    didInitRef.current = true;
    try {
      await initSheetStructure(ssid); // create our tabs + headers, delete default “Sheet1”
    } catch (e) {
      console.warn("initSheetStructure failed:", e?.message || e);
      // Optional tiny retry:
      // didInitRef.current = false;
      // setTimeout(handleHiddenIframeLoad, 800);
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

        {/* Always show your two tabs (no sheet tab) */}
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

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="muted">Signed in as <b>{email}</b></span>
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {/* Hidden iframe — makes the spreadsheet “current” for spreadsheets.currentonly */}
      {ssid && (
        <iframe
          key={`hidden-${ssid}`}
          src={`https://docs.google.com/spreadsheets/d/${ssid}/edit?rm=embedded`}
          title="TokBoard Hidden Sheet Loader"
          onLoad={handleHiddenIframeLoad}
          // hidden but still loads reliably
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
            border: 0,
            left: -9999,
            top: -9999,
          }}
          aria-hidden="true"
        />
      )}

      {/* Visible page content = your in-app tabs only */}
      <div className="page" style={{ padding: 24 }}>
        <TabComp email={email} ssid={ssid} />
      </div>
    </>
  );
}
