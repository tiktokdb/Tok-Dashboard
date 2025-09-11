import React, { useMemo, useState } from "react"
import Products from "./tabs/Products"
import BrandDeals from "./tabs/BrandDeals"

const TABS = [
  { key: "products", label: "Products" },
  { key: "branddeals", label: "Brand Deals" },
];

export default function Dashboard({ email, ssid, onSignOut }) {
  const [tab, setTab] = useState("products")
  const TabComp = useMemo(() => {
    switch (tab) {
      case "products":
        return Products
      case "branddeals":
        return BrandDeals // ✅ now it loads your new tab
      default:
        return Products
    }
  }, [tab])

  return (
    <>
      {/* Top bar */}
      <div className="tb">
        <div className="brand">
          <span className="dot" /> TokBoard
          <span className="muted" style={{marginLeft:8}}>for Creators</span>
        </div>
        <div className="chips">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`chip ${tab===t.key ? "active":""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div>
          <span className="muted" style={{marginRight:10}}>Signed in as <b>{email}</b></span>
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {/* Active tab */}
      <div className="page">
        <TabComp email={email} ssid={ssid} />
      </div>
    </>
  )
}
