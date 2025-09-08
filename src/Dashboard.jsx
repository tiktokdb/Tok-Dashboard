import React, { useMemo, useState } from "react"
import Products from "./tabs/Products"

const TABS = [
  { key: "products", label: "Products" },
  { key: "branddeals", label: "Brand Deals", coming: true },
  { key: "requests", label: "Requests", coming: true },
  { key: "times", label: "Posting Times", coming: true },
]

export default function Dashboard({ email, onSignOut }) {
  const [tab, setTab] = useState("products")
  const TabComp = useMemo(() => {
    switch (tab) {
      case "products":
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
              onClick={()=>!t.coming && setTab(t.key)}
              title={t.coming ? "Coming soon" : ""}
              disabled={t.coming}
            >
              {t.label}{t.coming ? " (soon)" : ""}
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
        <TabComp email={email} />
      </div>
    </>
  )
}
