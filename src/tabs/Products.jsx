// src/tabs/Products.jsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import { readTab } from "../google"

/* ------------ constants ------------ */
const STATUSES = ["Incoming", "Reviewing", "Filming", "Posted"]
const DELIVERABLES = ["Video", "Story", "Live", "Photo"]
const ACTIVE_TAB = "Products"
const POSTED_TAB = "Posted"
const isHttp = (s) => /^https?:\/\//i.test((s || "").trim())
const todayISO = () => new Date().toISOString().slice(0, 10)

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


/* money + boolean helpers */
const money = (v) => {
  const n = parseFloat(String(v ?? "").toString().replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}
const isTrue = (v) => {
  const s = String(v ?? "").trim().toLowerCase()
  return (
    v === true ||
    s === "true" ||
    s === "yes" ||
    s === "y" ||
    s === "1" ||
    s === "✓" ||
    s === "checked"
  )
}

// keep money() and isTrue() above, then add:
const clampMoney = (v) => {
  const n = money(v);
  return n < 0 ? 0 : +n.toFixed(2);
};

const formatCurrency = (v) => {
  const n = money(v);
  if (!n) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
};

/* ------------ row shape (uses simplified Got as + Reimbursed) ------------ */
function newRow() {
  return {
    Product: "",
    Brand: "",
    Status: "Incoming",
    Deliverable: "Video",
    "Due Date": "",
    "Cost of Product": "",
    "Value (MSRP)": "",
    "Got as": "Paid", // Paid | Free
    Reimbursed: false, // only meaningful when Got as = Paid
    Link: "",
    Note: "",
  }
}

/* ---------- ids, sig, strip runtime ---------- */
const SIG_KEYS = [
  "Product",
  "Brand",
  "Deliverable",
  "Due Date",
  "Cost of Product",
  "Value (MSRP)",
  "Got as",
  "Reimbursed",
  "Link",
  "Note",
]
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
const HEADERS = [
  "Product",
  "Brand",
  "Status",
  "Deliverable",
  "Due Date",
  "Cost of Product",
  "Value (MSRP)",
  "Got as",
  "Reimbursed",
  "Link",
  "Note",
] // A..K

async function ensureSheetExists(ssid, title) {
  try {
    await readTabDedup(ssid, title)
  } catch {
    try {
      await window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssid,
        resource: { requests: [{ addSheet: { properties: { title } } }] },
      })
    } catch {}
  }
  await ensureHeaders(ssid, title)
}

/* Always normalize the header row to our latest HEADERS (safe even on old tabs) */
async function ensureHeaders(ssid, title) {
  try {
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: ssid,
      range: `'${title}'!A1:K1`,
    })
    const existing = res.result?.values?.[0] ?? []
    const sameLen = existing.length === HEADERS.length
    const same =
      sameLen && HEADERS.every((h, i) => (existing[i] || "") === h)

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

/* Hard-replace rows: clear A2:K then write */
async function replaceTabRows(ssid, title, rows) {
  await window.gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: ssid,
    range: `'${title}'!A2:K`,
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

/* ---------- tiny themed confirm modal ---------- */
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
      aria-label="Delete item confirm"
      onClick={onCancel}
    >
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px 0" }}>Delete item?</h3>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          This will remove <b>{name || "this item"}</b> from the list.
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
  export default function Products({ ssid }) {

  // Active rows (not posted)
  const [rows, setRows] = useState([])
  const [dirty, setDirty] = useState(false)

  // Posted rows (archive)
  const [postedRows, setPostedRows] = useState([])
  const [postedDirty, setPostedDirty] = useState(false)

  // UI state
  const [view, setView] = useState("active") // "active" | "posted"
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingPosted, setSavingPosted] = useState(false)
  const [error, setError] = useState(null)
  const [q, setQ] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [sort, setSort] = useState("updated-desc")
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [lastSavedPostedAt, setLastSavedPostedAt] = useState(null)

  // confirm modal
  const [confirm, setConfirm] = useState({ open: false, idx: null, name: "" })

  // always-current refs (for immediate saves)
  const rowsRef = useRef(rows)
  const postedRowsRef = useRef(postedRows)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  useEffect(() => {
    postedRowsRef.current = postedRows
  }, [postedRows])

  const loadedRef = useRef(false)

  /* ---------- initial load ---------- */
useEffect(() => {
  if (!ssid) return;

  let cancelled = false;
  const loadId = Math.random().toString(36).slice(2);

  // Debounce: don’t hit Sheets if the tab is flipped away immediately
  const timer = setTimeout(async () => {
    if (cancelled) return;
    console.log("🟦 Products load START", loadId, ssid);
    setLoading(true);
    setError(null);

    try {
      await ensureSheetExists(ssid, ACTIVE_TAB);
      await ensureSheetExists(ssid, POSTED_TAB);

      const [active, posted] = await Promise.all([
        withRetry(() => readTabDedup(ssid, ACTIVE_TAB), 1),
        withRetry(() => readTabDedup(ssid, POSTED_TAB), 1),
      ]);

      if (cancelled) return;

      const normActive = withIds((active.length ? active : []).map(r => ({ ...newRow(), ...r })));
      const normPosted = withIds(dedupeBySig((posted.length ? posted : []).map(r => ({ ...newRow(), ...r }))));

      setRows(normActive);
      setPostedRows(normPosted);
      if (normPosted.length !== posted.length) setPostedDirty(true);

      console.log("🟩 Products load DONE", loadId, { rows: normActive.length, posted: normPosted.length });
    } catch (e) {
      if (!cancelled) {
        console.error("❌ Products load FAILED", loadId, e);
        setError(e?.message || "Failed to load Products");
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
    console.log("🟥 Products load CANCEL", loadId);
  };
}, [ssid]);

  /* ---------- immediate sheet writer (used on cross-moves & deletes) ---------- */
  async function persistSheetsNow(nextActive, nextPosted) {
    if (!ssid) return
    try {
      await Promise.all([
        replaceTabRows(ssid, ACTIVE_TAB, nextActive ?? rowsRef.current),
        replaceTabRows(
          ssid,
          POSTED_TAB,
          dedupeBySig(nextPosted ?? postedRowsRef.current),
        ),
      ])
      setLastSavedAt(Date.now())
      setLastSavedPostedAt(Date.now())
      setDirty(false)
      setPostedDirty(false)
    } catch (e) {
      console.error("⚠️ Immediate persist failed:", e)
      setDirty(true)
      setPostedDirty(true)
    }
  }

  /* ---------- debounced autosave (active) ---------- */
  useEffect(() => {
    if (!ssid || !dirty) return
    const t = setTimeout(async () => {
      try {
        setSaving(true)
        await replaceTabRows(ssid, ACTIVE_TAB, rows)
        setDirty(false)
        setLastSavedAt(Date.now())
      } catch (e) {
        console.error("❌ Autosave (active) failed:", e)
        setError(e?.message || "Autosave failed")
      } finally {
        setSaving(false)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [ssid, rows, dirty])

  /* ---------- debounced autosave (posted) ---------- */
  useEffect(() => {
    if (!ssid || !postedDirty) return
    const t = setTimeout(async () => {
      try {
        setSavingPosted(true)
        await replaceTabRows(ssid, POSTED_TAB, dedupeBySig(postedRows))
        setPostedDirty(false)
        setLastSavedPostedAt(Date.now())
      } catch (e) {
        console.error("❌ Autosave (posted) failed:", e)
        setError(e?.message || "Autosave (posted) failed")
      } finally {
        setSavingPosted(false)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [ssid, postedRows, postedDirty])

  /* ---------- actions ---------- */
  function addRow(count = 1) {
    setRows((p) =>
      withIds([...p, ...Array.from({ length: count }, () => newRow())]),
    )
    setDirty(true)
  }

  function deleteRowAt(i) {
    const nextActive = rowsRef.current.filter((_, idx) => idx !== i)
    setRows(nextActive)
    setDirty(true)
    persistSheetsNow(nextActive, postedRowsRef.current)
  }

  // Move between lists when status crosses to/from "Posted"
    function update(i, key, val) {
    if (view === "active") {
        setRows((prev) => {
        const current = prev[i];
        const next = { ...current, [key]: val };

        // If changing to Free, reimbursed cannot be true
        if (key === "Got as" && val === "Free") next.Reimbursed = false;

        // to Posted
        if (key === "Status" && val === "Posted" && current.Status !== "Posted") {
            const remaining = prev.filter((_, idx) => idx !== i);
            const newPosted = dedupeBySig(withIds([...postedRowsRef.current, next]));
            setPostedRows(newPosted);
            if (loadedRef.current) { setDirty(true); setPostedDirty(true); }
            persistSheetsNow(remaining, newPosted);
            return remaining;
        }

        const clone = [...prev];
        clone[i] = next;
        if (loadedRef.current) setDirty(true);
        return clone;
        });
    } else {
        // view === "posted"
        setPostedRows((prev) => {
        const current = prev[i];
        const next = { ...current, [key]: val };

        // If changing to Free, reimbursed cannot be true
        if (key === "Got as" && val === "Free") next.Reimbursed = false;

        // back to Active
        if (key === "Status" && val !== "Posted" && current.Status === "Posted") {
            const remaining = prev.filter((_, idx) => idx !== i);
            const newActive = withIds([...rowsRef.current, next]);
            setRows(newActive);
            if (loadedRef.current) { setDirty(true); setPostedDirty(true); }
            persistSheetsNow(newActive, remaining);
            return remaining;
        }

        const clone = [...prev];
        clone[i] = next;
        if (loadedRef.current) setPostedDirty(true);
        return clone;
        });
    }
    }

  async function saveNow() {
    if (!ssid) return
    try {
      setSaving(true)
      setSavingPosted(true)
      await replaceTabRows(ssid, ACTIVE_TAB, rows)
      await replaceTabRows(ssid, POSTED_TAB, dedupeBySig(postedRows))
      setDirty(false)
      setPostedDirty(false)
      setLastSavedAt(Date.now())
      setLastSavedPostedAt(Date.now())

      const freshA = await readTab(ssid, ACTIVE_TAB)
      const freshP = await readTab(ssid, POSTED_TAB)
      setRows(withIds(freshA.map((r) => ({ ...newRow(), ...r }))))
      setPostedRows(
        withIds(dedupeBySig(freshP.map((r) => ({ ...newRow(), ...r })))),
      )
    } catch (e) {
      console.error("❌ Save failed:", e)
      setError(e?.message || "Save failed")
    } finally {
      setSaving(false)
      setSavingPosted(false)
    }
  }

  /* ---------- filtering + sorting ---------- */
  const filteredActive = useMemo(() => {
    let data = rows
    if (q.trim()) {
      const s = q.toLowerCase()
      data = data.filter(
        (r) =>
          (r.Product || "").toLowerCase().includes(s) ||
          (r.Brand || "").toLowerCase().includes(s) ||
          (r.Note || "").toLowerCase().includes(s),
      )
    }
    if (statusFilter !== "All") {
      data = data.filter((r) => (r.Status || "Incoming") === statusFilter)
    } else {
      data = data.filter((r) => (r.Status || "Incoming") !== "Posted")
    }
    switch (sort) {
      case "cost-desc":
        data = [...data].sort(
          (a, b) =>
            money(b["Cost of Product"]) - money(a["Cost of Product"]) || 0,
        )
        break
      case "cost-asc":
        data = [...data].sort(
          (a, b) =>
            money(a["Cost of Product"]) - money(b["Cost of Product"]) || 0,
        )
        break
      case "name-asc":
        data = [...data].sort((a, b) =>
          (a.Product || "").localeCompare(b.Product || ""),
        )
        break
      case "name-desc":
        data = [...data].sort((a, b) =>
          (b.Product || "").localeCompare(a.Product || ""),
        )
        break
      default:
        break
    }
    return data
  }, [rows, q, statusFilter, sort])

  const filteredPosted = useMemo(() => {
    let data = postedRows
    if (q.trim()) {
      const s = q.toLowerCase()
      data = data.filter(
        (r) =>
          (r.Product || "").toLowerCase().includes(s) ||
          (r.Brand || "").toLowerCase().includes(s) ||
          (r.Note || "").toLowerCase().includes(s),
      )
    }
    if (statusFilter !== "All") {
      data = data.filter((r) => (r.Status || "Posted") === statusFilter)
    }
    switch (sort) {
      case "cost-desc":
        data = [...data].sort(
          (a, b) =>
            money(b["Cost of Product"]) - money(a["Cost of Product"]) || 0,
        )
        break
      case "cost-asc":
        data = [...data].sort(
          (a, b) =>
            money(a["Cost of Product"]) - money(b["Cost of Product"]) || 0,
        )
        break
      case "name-asc":
        data = [...data].sort((a, b) =>
          (a.Product || "").localeCompare(b.Product || ""),
        )
        break
      case "name-desc":
        data = [...data].sort((a, b) =>
          (b.Product || "").localeCompare(a.Product || ""),
        )
        break
      default:
        break
    }
    return data
  }, [postedRows, q, statusFilter, sort])

  const visible = view === "active" ? filteredActive : filteredPosted

  /* ---------- export CSV for ACTIVE ---------- */
  function exportCsvOfCurrentView() {
    const data =
        view === "active"
        ? (filteredActive.length ? filteredActive : rows)
        : (filteredPosted.length ? filteredPosted : postedRows);

    const lines = [
        HEADERS.join(","),
        ...data.map((r) =>
        HEADERS.map((h) => {
            const raw = (r[h] ?? "").toString();
            const needsQuotes = /[",\n]/.test(raw);
            const escaped = raw.replace(/"/g, '""');
            return needsQuotes ? `"${escaped}"` : escaped;
        }).join(",")
        ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    }

  /* ---------- KPIs: Purchased vs Free/Reimbursed ---------- */
  const kpi = useMemo(() => {
    const arr = view === "active" ? rows : postedRows

    let purchasedCost = 0 // sum of costs when Got as = Paid
    let unreimbursedCost = 0 // portion of above not reimbursed
    let freeValue = 0 // MSRP value for Free + Paid&Reimbursed

    for (const r of arr) {
      const cost = money(r["Cost of Product"])
      const msrp = money(r["Value (MSRP)"])
      const got = String(r["Got as"] || "Paid").toLowerCase()
      const reimb = isTrue(r.Reimbursed)

      if (got === "free") {
        freeValue += msrp
      } else {
        // Paid
        purchasedCost += cost
        if (!reimb) unreimbursedCost += cost
        if (reimb) freeValue += msrp || cost
      }
    }

    const filming = rows.filter((r) => r.Status === "Filming").length
    const posted = postedRows.length

    return { purchasedCost, unreimbursedCost, freeValue, filming, posted }
  }, [rows, postedRows, view])

  /* ---------- render ---------- */
  return (
    <>
      {/* KPIs */}
      <div className="kpis">
        {/* Purchased */}
        <div className="card k">
          <h4>Purchased ({view === "active" ? "Active" : "Posted"})</h4>
          <div className="v">${kpi.purchasedCost.toFixed(2)}</div>
          <div className="muted">Unreimbursed cost</div>
          <div className="muted">${kpi.unreimbursedCost.toFixed(2)}</div>
        </div>

        {/* Free / Reimbursed */}
        <div className="card k">
          <h4>Free / Reimbursed</h4>
          <div className="v">${kpi.freeValue.toFixed(2)}</div>
          <div className="muted">MSRP value (gifted + reimbursed)</div>
        </div>

        {/* Filming */}
        <div className="card k">
          <h4>Filming</h4>
          <div className="v">
            {kpi.filming} <span className="badge warn">on deck</span>
          </div>
        </div>

        {/* Posted (clickable) */}
        <div
          className="card k"
          role="button"
          tabIndex={0}
          onClick={() => setView("posted")}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && setView("posted")
          }
          aria-label="View Posted items"
        >
          <h4>Posted</h4>
          <div className="v">
            {kpi.posted} <span className="badge ok">done</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card toolbar">
        <div className="chips" style={{ marginRight: 10 }}>
          <button
            className={`chip ${view === "active" ? "active" : ""}`}
            onClick={() => setView("active")}
          >
            Active
          </button>
          <button
            className={`chip ${view === "posted" ? "active" : ""}`}
            onClick={() => setView("posted")}
          >
            Posted
          </button>
        </div>

        <input
          className="input"
          placeholder="Search product, brand, note…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option>All</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="select"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated-desc">Sort: Updated</option>
          <option value="cost-desc">Sort: Cost ↓</option>
          <option value="cost-asc">Sort: Cost ↑</option>
          <option value="name-asc">Sort: Name A–Z</option>
          <option value="name-desc">Sort: Name Z–A</option>
        </select>
        <button className="btn" onClick={() => addRow(1)} disabled={view !== "active"}>
          + Add
        </button>
        <button className="btn" onClick={() => addRow(5)} disabled={view !== "active"}>
          +5
        </button>
        <button className="btn" onClick={exportCsvOfCurrentView}>
            Export CSV
            </button>
        <button
          className="btn primary"
          disabled={!ssid || saving || savingPosted || (!dirty && !postedDirty)}
          onClick={saveNow}
        >
          {saving || savingPosted
            ? "Saving…"
            : dirty || postedDirty
            ? "Save now"
            : lastSavedAt || lastSavedPostedAt
            ? `Saved ${new Date(
                (lastSavedPostedAt || lastSavedAt) || Date.now(),
              ).toLocaleTimeString()}`
            : "Saved"}
        </button>
        {loading && <span className="muted">Loading…</span>}
        {error && (
          <span className="muted" style={{ color: "#fca5a5" }}>
            {" "}
            {error}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="tableWrap card">
        <table>
            <thead>
            <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>
                Status
                <span className="th-help" aria-label="What does Status mean?">
                    <span className="th-tip">
                    Track the stage: <b>Incoming</b> → <b>Reviewing</b> → <b>Filming</b> → <b>Posted</b>.
                    </span>
                </span>
                </th>
                <th>
                Deliverable
                <span className="th-help" aria-label="What is a Deliverable?">
                    <span className="th-tip">
                    What you’re promising to post:
                    <br/>• <b>Video</b>
                    <br/>• <b>Story</b>
                    <br/>• <b>Live</b>
                    <br/>• <b>Photo</b>
                    </span>
                </span>
                </th>
                <th>Due</th>
                <th>
                Cost
                <span className="th-help" aria-label="What is Cost?">
                  <span className="th-tip">
                    Your out-of-pocket cost for this product. <br/>
                    • If reimbursed, also mark the Reimbursed box. <br/>
                    • Use 0.00 for gifted items.
                  </span>
                </span>
              </th>
              <th>
                Value (MSRP)
                <span className="th-help" aria-label="What is Value (MSRP)?">
                  <span className="th-tip">
                    The product’s retail value (manufacturer’s suggested price). <br/>
                    • Used for reporting gifted/reimbursed value. <br/>
                    • Example: if free $200 headphones, enter 200.00 here.
                  </span>
                </span>
              </th>
                <th>Got as</th>
                <th>Reimbursed</th>
                <th>Link</th>
                <th></th>
            </tr>
            </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.__id || i}>
                <td>
                  <input
                    value={r.Product}
                    onChange={(e) => update(i, "Product", e.target.value)}
                    placeholder="e.g. Ring Light Pro"
                  />
                </td>
                <td>
                  <input
                    value={r.Brand}
                    onChange={(e) => update(i, "Brand", e.target.value)}
                    placeholder="@brandhandle"
                  />
                </td>
                <td>
                  <select
                    value={r.Status}
                    onChange={(e) => update(i, "Status", e.target.value)}
                    title="Stages: Incoming → Reviewing → Filming → Posted"
                    aria-label="Status"
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={r.Deliverable}
                    onChange={(e) => update(i, "Deliverable", e.target.value)}
                    aria-label="Deliverable"
                  >
                    {DELIVERABLES.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </td>
                <td>
                <input
                    type="date"
                    value={r["Due Date"]}
                    onChange={(e) => update(i, "Due Date", e.target.value)}
                    className={
                    r.Status !== "Posted" &&
                    r["Due Date"] &&
                    r["Due Date"] < todayISO()
                        ? "input-overdue"
                        : ""
                    }
                />
                </td>

                <td>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="$0.00"
                  value={r["Cost of Product"]}
                  onChange={(e) => update(i, "Cost of Product", e.target.value)}
                  onBlur={(e) => {
                    const clamped = clampMoney(e.target.value);
                    update(i, "Cost of Product", formatCurrency(clamped));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const clamped = clampMoney(e.target.value);
                      update(i, "Cost of Product", formatCurrency(clamped));
                      e.target.blur(); // trigger blur styling
                    }
                  }}
                  style={{ textAlign: "right" }}
                />
              </td>

              <td>
              <input
                type="text"
                inputMode="decimal"
                placeholder="$0.00"
                value={r["Value (MSRP)"]}
                onChange={(e) => update(i, "Value (MSRP)", e.target.value)}
                onBlur={(e) => {
                  const clamped = clampMoney(e.target.value);
                  update(i, "Value (MSRP)", formatCurrency(clamped));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const clamped = clampMoney(e.target.value);
                    update(i, "Value (MSRP)", formatCurrency(clamped));
                    e.target.blur();
                  }
                }}
                style={{ textAlign: "right" }}
              />
            </td>

                <td>
                <select
                    value={r["Got as"]}
                    onChange={(e) => update(i, "Got as", e.target.value)}
                    aria-label="Got as"
                >
                    <option>Paid</option>
                    <option>Free</option>
                </select>
                </td>
                <td style={{ textAlign: "center" }}>
                  {(() => {
                    const gotAsFree = (r["Got as"] || "Paid") === "Free";
                    return (
                    <input
                        type="checkbox"
                        disabled={gotAsFree}
                        checked={isTrue(r.Reimbursed)}
                        onChange={(e) => update(i, "Reimbursed", e.target.checked)}
                        title={gotAsFree ? "Free items aren't reimbursed" : "Mark true when reimbursed"}
                        aria-label="Reimbursed"
                    />
                    );
                })()}
                </td>
                <td>
                  <div className="cell">
                    <input
                      value={r.Link}
                      onChange={(e) => update(i, "Link", e.target.value)}
                      placeholder="Tracking/affiliate link"
                    />
                    {isHttp(r.Link) && (
                      <button
                        className="btn"
                        title="Open link"
                        onClick={() =>
                          window.open(r.Link, "_blank", "noopener,noreferrer")
                        }
                      >
                        ↗
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  {view === "active" ? (
                    <button
                      className="btn"
                      title="Delete"
                      onClick={() =>
                        setConfirm({
                          open: true,
                          idx: i,
                          name: r.Product || "this item",
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

          <tfoot>
            <tr>
              <td colSpan={9} />
              <td colSpan={2} className="muted" style={{ textAlign: "right" }}>
                {(view === "active" ? rows.length : postedRows.length)} item
                {(view === "active" ? rows.length : postedRows.length) === 1
                  ? ""
                  : "s"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Themed confirm */}
      <ConfirmModal
        open={confirm.open}
        name={confirm.name}
        onCancel={() => setConfirm({ open: false, idx: null, name: "" })}
        onConfirm={() => {
          deleteRowAt(confirm.idx)
          setConfirm({ open: false, idx: null, name: "" })
        }}
      />
    </>
  )
}
