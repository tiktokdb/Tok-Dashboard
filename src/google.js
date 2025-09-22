// src/google.js

let gapiInitPromise = null
let tokenClient = null
let tokenResolver = null

function loadGapi() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.gapi && window.google) resolve()
      else setTimeout(check, 50)
    }
    check()
  })
}

// --- small helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function clearAuthAndRestart() {
  try { window.gapi?.client?.setToken(null) } catch {}
  try { sessionStorage.removeItem("tokboard_token") } catch {}
  try { sessionStorage.removeItem("tokboard_ssid") } catch {}
  window.location.assign(`${window.location.origin}/`)
}

/* ===== require BOTH scopes ===== */
export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets.currentonly",
  "openid",
  "email",
]

let showedScopeAlert = false
function scopeAlertOnce() {
  if (showedScopeAlert) return
  showedScopeAlert = true
  alert(
    "TokBoard needs BOTH permissions:\n\n" +
    "• Google Drive (files used with this app)\n" +
    "• Google Sheets (current sheet)\n\n" +
    "Please check both boxes. You'll be sent back to the sign-in screen to try again."
  )
}

// Read actual scopes from the token (bullet-proof)
async function verifyTokenScopes(accessToken) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    )
    if (!res.ok) return false
    const json = await res.json()
    const granted = new Set(String(json.scope || "").split(/\s+/).filter(Boolean))
    // Must include BOTH Drive + Sheets
    const need = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets.currentonly",
    ]
    return need.every(s => granted.has(s))
  } catch {
    return false
  }
}

// If Google throws permission errors during API calls, bounce user to restart
function isInsufficientPermissions(err) {
  const code = err?.status || err?.result?.error?.code
  const msg  = (err?.result?.error?.message || "").toLowerCase()
  return code === 403 || msg.includes("insufficientpermissions")
}

async function with403Retry(fn, { retries = 1, delayMs = 1200 } = {}) {
  try {
    return await fn()
  } catch (err) {
    if (isInsufficientPermissions(err)) {
      scopeAlertOnce()
      clearAuthAndRestart()
      return
    }
    const status = err?.status || err?.result?.error?.code
    if (status === 403 && retries > 0) {
      await sleep(delayMs)
      return with403Retry(fn, { retries: retries - 1, delayMs })
    }
    throw err
  }
}

/* ===== Sheets helpers ===== */

async function deleteSheetsIfExist(ssid, titles) {
  try {
    const meta = await window.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: ssid,
      includeGridData: false,
    })
    const toDelete = (meta.result.sheets || [])
      .filter(s => titles.includes(s.properties.title))
      .map(s => s.properties.sheetId)

    if (toDelete.length) {
      await with403Retry(() =>
        window.gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: ssid,
          resource: { requests: toDelete.map(id => ({ deleteSheet: { sheetId: id } })) },
        })
      )
    }
  } catch (e) {
    console.warn("Could not delete legacy sheets:", e?.message || e)
  }
}

async function deleteDefaultSheets(ssid) {
  try {
    const meta = await window.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: ssid,
      includeGridData: false,
    })
    const isDefaultTitle = (t) => /^Sheet(\s?\d+)?$/i.test((t || "").trim())
    const keep = new Set(["Products", "Brand Deals", "Completed Deals"])

    const toDelete = (meta.result.sheets || [])
      .filter(s => isDefaultTitle(s.properties.title) && !keep.has(s.properties.title))
      .map(s => s.properties.sheetId)

    if (!toDelete.length) return

    await with403Retry(() =>
      window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssid,
        resource: { requests: toDelete.map(id => ({ deleteSheet: { sheetId: id } })) },
      })
    )
  } catch (e) {
    console.warn("Could not delete default Sheets:", e?.message || e)
  }
}

/* ===== init & token ===== */

export async function initGoogle({ apiKey, clientId, scopes }) {
  if (gapiInitPromise) return gapiInitPromise

  gapiInitPromise = (async () => {
    await loadGapi()
    await new Promise((res) => window.gapi.load("client", res))

    await window.gapi.client.init({
      apiKey,
      discoveryDocs: [
        "https://sheets.googleapis.com/$discovery/rest?version=v4",
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    })

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes || REQUIRED_SCOPES.join(" "),
      callback: (resp) => {
        if (!tokenResolver) return
        if (resp && resp.error) tokenResolver.reject(resp)
        else tokenResolver.resolve(resp)
        tokenResolver = null
      },
    })
  })()

  return gapiInitPromise
}

export async function ensureToken(prompt = "consent") {
  if (!gapiInitPromise) throw new Error("gapi not initialized yet")
  if (!tokenClient) throw new Error("tokenClient not initialized yet")

  return new Promise((resolve, reject) => {
    tokenResolver = {
      resolve: async (resp) => {
        // Handle popup/denied
        if (resp?.error) {
          const err = String(resp.error).toLowerCase()
          if (err.includes("popup") || err.includes("access_denied")) {
            alert(
              "Please allow pop-ups for TokBoard, then click Sign in again.\n\n" +
              "(If you just enabled pop-ups, click Sign in once more.)"
            )
          }
          return reject(resp)
        }

        // Save token
        try {
          if (resp?.access_token) {
            window.gapi?.client?.setToken({ access_token: resp.access_token })
            const expiresAt = Date.now() + ((resp?.expires_in || 3600) - 60) * 1000
            sessionStorage.setItem(
              "tokboard_token",
              JSON.stringify({ access_token: resp.access_token, expires_at: expiresAt })
            )
          }
        } catch (e) {
          console.warn("⚠️ Could not persist token:", e)
        }

        // 🔒 Verify scopes via tokeninfo (don’t trust UI checkboxes)
        const token = resp?.access_token
        const ok = token ? await verifyTokenScopes(token) : false
        if (!ok) {
          scopeAlertOnce()
          clearAuthAndRestart() // wipe + kick back to landing
          return
        }

        resolve(resp)
      },
      reject,
    }

    try {
      tokenClient.requestAccessToken({ prompt })
    } catch (err) {
      console.error("❌ Exception when calling requestAccessToken:", err)
      reject(err)
    }
  })
}

export function getAccessToken() {
  const tok = window.gapi.client.getToken()
  return tok?.access_token || null
}

export async function fetchUserEmail() {
  const token = getAccessToken()
  if (!token) return null
  const resp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return (data.email || "").toLowerCase()
}

/* ===== Drive / Sheets entry points ===== */

let creatingPromise = null

export async function findOrCreateSpreadsheet() {
  if (creatingPromise) return creatingPromise

  const cached = sessionStorage.getItem("tokboard_ssid")
  if (cached) return cached

  creatingPromise = (async () => {
    const q =
      "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and appProperties has { key='tokdashboard_v2' and value='1' }"
    const list = await window.gapi.client.drive.files.list({
      q,
      fields: "files(id,name)",
    })

    if (list.result.files && list.result.files.length) {
      const ssid = list.result.files[0].id
      sessionStorage.setItem("tokboard_ssid", ssid)
      await deleteSheetsIfExist(ssid, ["Requests", "Posting Times", "Sheet1"])
      await deleteDefaultSheets(ssid)
      return ssid
    }

    const created = await window.gapi.client.drive.files.create({
      resource: {
        name: "TokBoard",
        mimeType: "application/vnd.google-apps.spreadsheet",
        appProperties: { tokdashboard_v2: "1" },
      },
      fields: "id",
    })

    const ssid = created.result.id
    sessionStorage.setItem("tokboard_ssid", ssid)
    sessionStorage.setItem("tokboard_needs_init", "1")
    return ssid
  })().finally(() => {
    creatingPromise = null
  })

  return creatingPromise
}

// Called AFTER the Sheet is “current” (e.g., iframe onLoad)
export async function initSheetStructure(ssid) {
   const parts = [
     ["Products", [
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
    ]],
    [
      "Brand Deals",
      [
        "Brand/Company",
        "Campaign/Deal Name",
        "Source",
        "Payment",
        "Payment Type",
        "Status",
        "Due Date",
        "Deliverables",
        "Notes",
      ],
    ],
    [
      "Completed Deals",
      [
        "Brand/Company",
        "Campaign/Deal Name",
        "Source",
        "Payment",
        "Payment Type",
        "Status",
        "Due Date",
        "Deliverables",
        "Notes",
      ],
    ],
  ]

  for (const [title, headers] of parts) {
    try {
      await with403Retry(() =>
        window.gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: ssid,
          resource: { requests: [{ addSheet: { properties: { title } } }] },
        })
      )
    } catch (e) {}

    await with403Retry(() =>
      window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: ssid,
        range: `'${title}'!A1`,
        valueInputOption: "RAW",
        resource: { values: [headers] },
      })
    )
  }

  await sleep(200)
  await deleteDefaultSheets(ssid)
}

/* ===== read/write with header normalization ===== */

const CANON = {
  // Products
  "product": "Product",
  "brand": "Brand",
  "status": "Status",
  "deliverable": "Deliverable",
  "due date": "Due Date",
  "cost of product": "Cost of Product",
  "value (msrp)": "Value (MSRP)",
  "got as": "Got as",
  "reimbursed": "Reimbursed",
  "link": "Link",
  "note": "Note",
  // Brand Deals
  "brand/company": "Brand/Company",
  "campaign/deal name": "Campaign/Deal Name",
  "source": "Source",
  "payment": "Payment",
  "payment type": "Payment Type",
  "deliverables": "Deliverables",
  "notes": "Notes",
}

const inflightReads = new Map()

export async function readTab(ssid, tab) {
  const key = `${ssid}::${tab}`
  if (inflightReads.has(key)) return inflightReads.get(key)

  const p = window.gapi.client.sheets.spreadsheets.values
    .get({ spreadsheetId: ssid, range: `${tab}!A:Z` })
    .then((resp) => {
      const rows = resp.result.values || []
      if (!rows.length) return []

      const rawHeaders = (rows[0] || []).map(h => String(h || "").trim())
      const headers = rawHeaders.map(h => CANON[h.toLowerCase()] || h)

      const data = rows.slice(1)
      return data.map((r) =>
        Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").toString().trim()]))
      )
    })
    .catch((err) => {
      console.error("❌ readTab error:", err)
      throw err
    })
    .finally(() => {
      inflightReads.delete(key)
    })

  inflightReads.set(key, p)
  return p
}

export async function writeTab(ssid, tab, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0] || {})
  const values = [headers, ...rows.map((r) => headers.map((h) => `${r[h] ?? ""}`))]

  await with403Retry(() =>
    window.gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: ssid,
      range: `${tab}!A:Z`,
    })
  )

  await with403Retry(() =>
    window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: ssid,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      resource: { values },
    })
  )
}
