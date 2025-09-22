// src/tabs/BrandDeals.jsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import { readTab } from "../google"

/* ------------ constants ------------ */
const DEAL_STATUSES = ["Negotiating", "In Progress", "Delivered", "Approved", "Paid"]
const ACTIVE_TAB = "Brand Deals"
const COMPLETED_TAB = "Completed Deals"

const HEADERS = [
  "Brand/Company",
  "Campaign/Deal Name",
  "Source",
  "Payment",
  "Payment Type",
  "Status",
  "Due Date",
  "Deliverables",
  "Notes",
] // A..I

// --- debounce + in-flight de-dupe helpers ---
const MOUNT_STABILIZE_MS = 250; // wait before hitting Sheets on mount
const _inFlight = new Map();
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const withRetry = async (fn, retries = 1) => {
  let err;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { err = e; if (i < retries) await delay(300); }
  }
  throw err;
};
function readTabDedup(ssid, title) {
  const key = `${ssid}::${title}`;
  if (_inFlight.has(key)) return _inFlight.get(key);
  const p = readTab(ssid, title).finally(() => _inFlight.delete(key));
  _inFlight.set(key, p);
  return p;
}


/* money helper */
const money = (v) => {
  const n = parseFloat(String(v ?? "").toString().replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}
const clampMoney = (v) => {
  const n = money(v)
  return n < 0 ? 0 : +n.toFixed(2)
}

const formatCurrency = (v) => {
  const n = money(v);
  if (!n) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
};

/* ------------ row shape ------------ */
function newDeal() {
  return {
    "Brand/Company": "",
    "Campaign/Deal Name": "",
    "Source": "",
    "Payment": "",
    "Payment Type": "",
    "Status": "Negotiating",
    "Due Date": "",
    "Deliverables": "",
    "Notes": "",
  }
}

/* ---------- ids, sig, strip runtime ---------- */
const SIG_KEYS = HEADERS
const makeSig = (r) =>
  SIG_KEYS.map((k) => (r[k] ?? "").toString().trim().toLowerCase()).join("|")

const dedupeBySig = (arr) => {
  const seen = new Set()
  return arr.filter((r) => {
    const s = makeSig(r)
    if (seen.has(s)) return false
    seen.add(s)
    return true
  })
}

const withIds = (arr) =>
  arr.map((r) => ({
    ...r,
    __id: r.__id || (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
  }))

const stripRuntime = ({ __id, ...rest }) => rest

/* ---------- headers + sheet utils ---------- */
async function ensureSheetExists(ssid, title) {
  // Ensure the sheet (tab) exists without triggering a values read.
  try {
    const meta = await window.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: ssid,
      includeGridData: false,
    });
    const has = (meta.result.sheets || []).some(
      (s) => s.properties?.title === title
    );
    if (!has) {
      await window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssid,
        resource: { requests: [{ addSheet: { properties: { title } } }] },
      });
    }
  } catch {
    // best effort: if meta fails, still attempt to add
    try {
      await window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssid,
        resource: { requests: [{ addSheet: { properties: { title } } }] },
      });
    } catch {}
  }

  // Always normalize headers BEFORE the first real read.
  await ensureHeaders(ssid, title);
}

async function ensureHeaders(ssid, title) {
  try {
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: ssid,
      range: `'${title}'!A1:I1`,
    })
    const existing = res.result?.values?.[0] ?? []
    const sameLen = existing.length === HEADERS.length
    const same = sameLen && HEADERS.every((h, i) => (existing[i] || "") === h)
    if (!same) {
      await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: ssid,
        range: `'${title}'!A1`,
        valueInputOption: "RAW",
        resource: { values: [HEADERS] },
      })
    }
  } catch {
    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: ssid,
      range: `'${title}'!A1`,
      valueInputOption: "RAW",
      resource: { values: [HEADERS] },
    })
  }
}

async function replaceTabRows(ssid, title, rows) {
  await window.gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: ssid,
    range: `'${title}'!A2:I`,
  })
  const values = (rows || [])
    .map(stripRuntime)
    .map((r) => HEADERS.map((h) => r[h] ?? ""))
  if (values.length) {
    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: ssid,
      range: `'${title}'!A2`,
      valueInputOption: "RAW",
      resource: { values },
    })
  }
}

/* ---------- tiny confirm modal ---------- */
/* ---------- themed confirm modal (match Products) ---------- */
function ConfirmModal({ open, name, onConfirm, onCancel }) {
  if (!open) return null
  const overlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    backdropFilter: "blur(2px)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }
  const card = {
    width: "min(420px, 92vw)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03))",
    border: "1px solid var(--stroke)",
    borderRadius: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,.45)",
    color: "var(--text)",
    padding: 18,
  }
  const row = {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16,
  }
  const btn = {
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 700,
    border: "1px solid var(--stroke)",
    background: "rgba(255,255,255,.06)",
    color: "var(--text)",
    cursor: "pointer",
  }
  const danger = {
    ...btn,
    border: "1px solid var(--danger)",
    background: "rgba(239,68,68,.15)",
  }

  function onKey(e) {
    if (e.key === "Escape") onCancel()
  }
  return (
    <div
      style={overlay}
      onKeyDown={onKey}
      role="dialog"
      aria-modal="true"
      aria-label="Delete deal confirm"
      onClick={onCancel}
    >
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px 0" }}>Delete deal?</h3>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          This will remove <b>{name || "this deal"}</b> from the list.
        </p>
        <div style={row}>
          <button style={btn} onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button style={danger} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/* =================== Component =================== */
export default function BrandDeals({ ssid }) {
  const [activeRows, setActiveRows] = useState([])
  const [completedRows, setCompletedRows] = useState([])
  const [dirty, setDirty] = useState(false)
  const [completedDirty, setCompletedDirty] = useState(false)

  const [view, setView] = useState("active") // active | completed
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingCompleted, setSavingCompleted] = useState(false)
  const [error, setError] = useState(null)
  const [q, setQ] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [sort, setSort] = useState("updated-desc")
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [lastSavedCompletedAt, setLastSavedCompletedAt] = useState(null)

  const [confirm, setConfirm] = useState({ open: false, idx: null, name: "" })

  const activeRef = useRef(activeRows)
  const completedRef = useRef(completedRows)
  const loadedRef = useRef(false)

  useEffect(() => { activeRef.current = activeRows }, [activeRows])
  useEffect(() => { completedRef.current = completedRows }, [completedRows])

/* ---------- initial load ---------- */
useEffect(() => {
  if (!ssid) return;

  let cancelled = false;
  const loadId = Math.random().toString(36).slice(2);

  const timer = setTimeout(async () => {
    if (cancelled) return;
    console.log("🟦 BrandDeals load START", loadId, ssid);
    setLoading(true);
    setError(null);

    try {
      await ensureSheetExists(ssid, ACTIVE_TAB);
      await ensureSheetExists(ssid, COMPLETED_TAB);

      await delay(30);

      const [active, completed] = await Promise.all([
        withRetry(() => readTabDedup(ssid, ACTIVE_TAB), 1),
        withRetry(() => readTabDedup(ssid, COMPLETED_TAB), 1),
      ]);

      if (cancelled) return;

      const normActive = withIds((active.length ? active : []).map(r => ({ ...newDeal(), ...r })));
      const normCompleted = withIds(dedupeBySig((completed.length ? completed : []).map(r => ({ ...newDeal(), ...r }))));

      setActiveRows(normActive);
      setCompletedRows(normCompleted);

      console.log("🟩 BrandDeals load DONE", loadId, { active: normActive.length, completed: normCompleted.length });
    } catch (e) {
      if (!cancelled) {
        console.error("❌ BrandDeals load FAILED", loadId, e);
        setError(e?.message || "Failed to load Brand Deals");
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
        loadedRef.current = true;
      }
    }
  }, MOUNT_STABILIZE_MS);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    console.log("🟥 BrandDeals load CANCEL", loadId);
  };
}, [ssid]);

  /* ---------- immediate persist ---------- */
  async function persistNow(nextActive, nextCompleted) {
    if (!ssid) return
    try {
      await Promise.all([
        replaceTabRows(ssid, ACTIVE_TAB, nextActive ?? activeRef.current),
        replaceTabRows(ssid, COMPLETED_TAB, dedupeBySig(nextCompleted ?? completedRef.current)),
      ])
      setLastSavedAt(Date.now())
      setLastSavedCompletedAt(Date.now())
      setDirty(false)
      setCompletedDirty(false)
    } catch (e) {
      console.error("⚠️ Persist failed:", e)
      setDirty(true)
      setCompletedDirty(true)
    }
  }

  /* ---------- debounced autosave (active) ---------- */
  useEffect(() => {
    if (!ssid || !dirty || !loadedRef.current) return
    const t = setTimeout(async () => {
      try {
        setSaving(true)
        await replaceTabRows(ssid, ACTIVE_TAB, activeRef.current)
        setDirty(false)
        setLastSavedAt(Date.now())
      } catch (e) {
        console.error("❌ Autosave active failed:", e)
        setError(e?.message || "Autosave failed")
      } finally {
        setSaving(false)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [ssid, dirty])

  /* ---------- debounced autosave (completed) ---------- */
  useEffect(() => {
    if (!ssid || !completedDirty || !loadedRef.current) return
    const t = setTimeout(async () => {
      try {
        setSavingCompleted(true)
        await replaceTabRows(ssid, COMPLETED_TAB, dedupeBySig(completedRef.current))
        setCompletedDirty(false)
        setLastSavedCompletedAt(Date.now())
      } catch (e) {
        console.error("❌ Autosave completed failed:", e)
        setError(e?.message || "Autosave completed failed")
      } finally {
        setSavingCompleted(false)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [ssid, completedDirty])

  /* ---------- actions ---------- */
  function addRow(count = 1) {
    setActiveRows((p) => withIds([...p, ...Array.from({ length: count }, () => newDeal())]))
    setDirty(true)
  }

  function deleteRowAt(i) {
    const next = activeRef.current.filter((_, idx) => idx !== i)
    setActiveRows(next)
    setDirty(true)
    persistNow(next, completedRef.current)
  }

  function update(i, key, val) {
    if (view === "active") {
      setActiveRows((prev) => {
        const current = prev[i]
        const next = { ...current, [key]: val }

        // move to completed
        if (key === "Status" && val === "Paid" && current.Status !== "Paid") {
          const remaining = prev.filter((_, idx) => idx !== i)
          const newCompleted = dedupeBySig(withIds([...completedRef.current, next]))
          setCompletedRows(newCompleted)
          if (loadedRef.current) { setDirty(true); setCompletedDirty(true) }
          persistNow(remaining, newCompleted)
          return remaining
        }

        const clone = [...prev]
        clone[i] = next
        if (loadedRef.current) setDirty(true)
        return clone
      })
    } else {
      // editing completed
      setCompletedRows((prev) => {
        const current = prev[i]
        const next = { ...current, [key]: val }

        // move back to active
        if (key === "Status" && val !== "Paid" && current.Status === "Paid") {
          const remaining = prev.filter((_, idx) => idx !== i)
          const newActive = withIds([...activeRef.current, next])
          setActiveRows(newActive)
          if (loadedRef.current) { setDirty(true); setCompletedDirty(true) }
          persistNow(newActive, remaining)
          return remaining
        }

        const clone = [...prev]
        clone[i] = next
        if (loadedRef.current) setCompletedDirty(true)
        return clone
      })
    }
  }

  async function saveNow() {
    if (!ssid) return
    try {
      setSaving(true)
      setSavingCompleted(true)
      await replaceTabRows(ssid, ACTIVE_TAB, activeRows)
      await replaceTabRows(ssid, COMPLETED_TAB, dedupeBySig(completedRows))
      setDirty(false)
      setCompletedDirty(false)
      setLastSavedAt(Date.now())
      setLastSavedCompletedAt(Date.now())

      const freshA = await readTab(ssid, ACTIVE_TAB)
      const freshC = await readTab(ssid, COMPLETED_TAB)
      setActiveRows(withIds(freshA.map((r) => ({ ...newDeal(), ...r }))))
      setCompletedRows(withIds(dedupeBySig(freshC.map((r) => ({ ...newDeal(), ...r })))))
    } catch (e) {
      console.error("❌ Save failed:", e)
      setError(e?.message || "Save failed")
    } finally {
      setSaving(false)
      setSavingCompleted(false)
    }
  }

  /* ---------- filtering + sorting ---------- */
  const visible = useMemo(() => {
    let data = view === "active" ? activeRows : completedRows

    if (q.trim()) {
      const s = q.toLowerCase()
      data = data.filter(
        (r) =>
          (r["Brand/Company"] || "").toLowerCase().includes(s) ||
          (r["Campaign/Deal Name"] || "").toLowerCase().includes(s) ||
          (r["Notes"] || "").toLowerCase().includes(s),
      )
    }

    if (statusFilter !== "All") {
      data = data.filter((r) => (r.Status || "") === statusFilter)
    }

    switch (sort) {
      case "pay-desc":
        data = [...data].sort((a, b) => money(b["Payment"]) - money(a["Payment"]))
        break
      case "pay-asc":
        data = [...data].sort((a, b) => money(a["Payment"]) - money(b["Payment"]))
        break
      case "name-asc":
        data = [...data].sort((a, b) => (a["Campaign/Deal Name"] || "").localeCompare(b["Campaign/Deal Name"] || ""))
        break
      case "name-desc":
        data = [...data].sort((a, b) => (b["Campaign/Deal Name"] || "").localeCompare(a["Campaign/Deal Name"] || ""))
        break
      default:
        break
    }
    return data
  }, [activeRows, completedRows, view, q, statusFilter, sort])

  /* ---------- KPIs ---------- */
  const kpi = useMemo(() => {
    const act = activeRows.length
    const comp = completedRows.length
    const compTotal = completedRows.reduce((s, r) => s + money(r.Payment), 0)
    const compAvg = comp ? (compTotal / comp).toFixed(2) : "0.00"
    return { act, comp, compTotal, compAvg }
  }, [activeRows, completedRows])

  /* ---------- render ---------- */
  if (loading) return <p>Loading Brand Deals…</p>

  return (
    <>
      {/* KPIs */}
      <div className="kpis">
        <div className="card k"><h4>Active Deals</h4><div className="v">{kpi.act}</div></div>
        <div className="card k"><h4>Completed Deals</h4><div className="v">{kpi.comp}</div></div>
        <div className="card k"><h4>Total Earned</h4><div className="v">${kpi.compTotal.toFixed(2)}</div></div>
        <div className="card k"><h4>Avg Deal</h4><div className="v">${kpi.compAvg}</div></div>
      </div>

      {/* Toolbar */}
      <div className="card toolbar">
        <div className="chips">
          <button className={`chip ${view === "active" ? "active" : ""}`} onClick={() => setView("active")}>Active</button>
          <button className={`chip ${view === "completed" ? "active" : ""}`} onClick={() => setView("completed")}>Completed</button>
        </div>

        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option>All</option>
          {(view === "active" ? DEAL_STATUSES.filter(s => s !== "Paid") : ["Paid"]).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="updated-desc">Sort: Updated</option>
          <option value="pay-desc">Sort: Payment ↓</option>
          <option value="pay-asc">Sort: Payment ↑</option>
          <option value="name-asc">Sort: Name A–Z</option>
          <option value="name-desc">Sort: Name Z–A</option>
        </select>

        <button className="btn" onClick={() => addRow(1)} disabled={view !== "active"}>+ Add</button>
        <button className="btn" onClick={() => addRow(5)} disabled={view !== "active"}>+5</button>

        <button
          className="btn primary"
          disabled={!ssid || saving || savingCompleted || (!dirty && !completedDirty)}
          onClick={saveNow}
        >
          {saving || savingCompleted
            ? "Saving…"
            : dirty || completedDirty
            ? "Save now"
            : lastSavedAt || lastSavedCompletedAt
            ? `Saved ${new Date((lastSavedCompletedAt || lastSavedAt) || Date.now()).toLocaleTimeString()}`
            : "Saved"}
        </button>

        {error && <span style={{ color: "#fca5a5" }}>{error}</span>}
      </div>

      {/* Table */}
      <div className="tableWrap card">
        <table className="brandTable">
          <thead>
            <tr>
              <th>Brand/Company</th>
              <th>Campaign/Deal Name</th>
              <th>Source</th>
              <th>Payment</th>
              <th>Payment Type</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Deliverables</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.__id || i}>
                <td>
                    <input
                    value={r["Brand/Company"]}
                    onChange={(e) => update(i, "Brand/Company", e.target.value)}
                    placeholder="e.g. Nike"
                    />
                </td>

                <td>
                    <input
                    value={r["Campaign/Deal Name"]}
                    onChange={(e) => update(i, "Campaign/Deal Name", e.target.value)}
                    placeholder="e.g. Summer Launch Collab"
                    />
                </td>

                <td>
                    <input
                    value={r["Source"]}
                    onChange={(e) => update(i, "Source", e.target.value)}
                    placeholder="e.g. Email / TikTok DM"
                    />
                </td>

                <td>
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="$0.00"
                    value={r["Payment"]}
                    onChange={(e) => update(i, "Payment", e.target.value)}
                    onBlur={(e) => {
                    const clamped = clampMoney(e.target.value);
                    update(i, "Payment", formatCurrency(clamped));
                    }}
                    onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        const clamped = clampMoney(e.target.value);
                        update(i, "Payment", formatCurrency(clamped));
                        e.target.blur();
                    }
                    }}
                    style={{ textAlign: "right" }}
                />
                </td>

                <td>
                    <select
                    value={r["Payment Type"]}
                    onChange={(e) => update(i, "Payment Type", e.target.value)}
                    >
                    <option value=""></option>
                    <option value="Cash">Cash</option>
                    <option value="Gifted">Gifted</option>
                    <option value="Commission %">Commission %</option>
                    </select>
                </td>

                <td>
                    <select
                    value={r["Status"]}
                    onChange={(e) => update(i, "Status", e.target.value)}
                    >
                    {DEAL_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                    ))}
                    </select>
                </td>

                <td>
                    <input
                    type="date"
                    value={r["Due Date"]}
                    onChange={(e) => update(i, "Due Date", e.target.value)}
                    />
                </td>

                <td>
                    <input
                    value={r["Deliverables"]}
                    onChange={(e) => update(i, "Deliverables", e.target.value)}
                    placeholder="e.g. 1 TikTok video"
                    />
                </td>

                <td>
                    <textarea
                    rows={3}
                    value={r["Notes"]}
                    onChange={(e) => update(i, "Notes", e.target.value)}
                    placeholder="Any special instructions…"
                    />
                </td>

                <td>
                    {view === "active" ? (
                    <button
                        onClick={() =>
                        setConfirm({
                            open: true,
                            idx: i,
                            name: r["Campaign/Deal Name"],
                        })
                        }
                    >
                        🗑️
                    </button>
                    ) : (
                    <span className="muted">—</span>
                    )}
                </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm */}
      <ConfirmModal
        open={confirm.open}
        name={confirm.name}
        onCancel={() => setConfirm({ open: false, idx: null, name: "" })}
        onConfirm={() => { deleteRowAt(confirm.idx); setConfirm({ open: false, idx: null, name: "" }) }}
      />
    </>
  )
}
