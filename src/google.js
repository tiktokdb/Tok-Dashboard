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

// The two scopes TokBoard must have
export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets.currentonly",
  "openid",
  "email",
]

// Helper: ensure both scopes are granted; if not, alert + force re-consent
function ensureBothScopesOrReconsent(tokenResponse) {
  try {
    const ok = window.google.accounts.oauth2.hasGrantedAllScopes(
      tokenResponse,
      ...REQUIRED_SCOPES
    )
    if (!ok) {
      if (!showedScopeAlert) {
        showedScopeAlert = true
        alert(
          "TokBoard needs BOTH permissions:\n\n" +
          "• Google Drive (files used with this app)\n" +
          "• Google Sheets (current sheet)\n\n" +
          "Please check both boxes on the next screen."
        )
      }
      reconsentForRequiredScopes()
      return false
    }
  } catch {}
  return true
}

// Detect permission errors from Google APIs
function isInsufficientPermissions(err) {
  const code = err?.status || err?.result?.error?.code
  const msg  = (err?.result?.error?.message || "").toLowerCase()
  return code === 403 || msg.includes("insufficientpermissions")
}

// Kick user back to Google’s consent screen with both boxes required
export function reconsentForRequiredScopes() {
  if (!tokenClient) return
  tokenClient.requestAccessToken({
    scope: REQUIRED_SCOPES.join(" "),
    prompt: "consent",                 // force the checkboxes dialog
    include_granted_scopes: true,      // keep already-granted scopes checked
  })
}

// Show the alert just once per page load
let showedScopeAlert = false

// Wrap any Drive/Sheets call; if the user unchecked a box, we alert + bounce to consent
async function with403Retry(
  fn,
  { retries = 1, delayMs = 1200, reconsentOn403 = true } = {}
) {
  try {
    return await fn()
  } catch (err) {
    if (isInsufficientPermissions(err)) {
      if (!showedScopeAlert) {
        showedScopeAlert = true
        // 👇 This is the user-facing message you asked for
        alert(
          "TokBoard needs BOTH permissions:\n\n" +
          "• Google Drive (files used with this app)\n" +
          "• Google Sheets (current sheet)\n\n" +
          "Please check both boxes on the next screen."
        )
      }
      if (reconsentOn403) {
        try { reconsentForRequiredScopes() } catch {}
      }
      if (retries > 0) {
        await sleep(delayMs)
        return with403Retry(fn, { retries: retries - 1, delayMs, reconsentOn403 })
      }
    }
    throw err
  }
}

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
          resource: {
            requests: toDelete.map(id => ({ deleteSheet: { sheetId: id } })),
          },
        })
      )
    }
  } catch (e) {
    console.warn("Could not delete legacy sheets:", e?.message || e)
  }
}

// Delete any auto-created default tabs named "Sheet", "Sheet1", "Sheet 1", "Sheet2", etc.
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

export async function initGoogle({ apiKey, clientId, scopes }) {
  if (gapiInitPromise) return gapiInitPromise

  gapiInitPromise = (async () => {
    await loadGapi()
    await new Promise((res) => window.gapi.load("client", res))

    // Load Sheets v4 + Drive v3 discovery docs
    await window.gapi.client.init({
      apiKey,
      discoveryDocs: [
        "https://sheets.googleapis.com/$discovery/rest?version=v4",
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    })

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      // Always init with BOTH required scopes
      scope: REQUIRED_SCOPES.join(" "),
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

export async function ensureToken(prompt = "") {
  if (!gapiInitPromise) throw new Error("gapi not initialized yet")
  if (!tokenClient) throw new Error("tokenClient not initialized yet")

  return new Promise((resolve, reject) => {
    let attempts = 0

    const onToken = (resp) => {
      // Handle popup issues cleanly so the app doesn't hang
      if (resp?.error) {
        const err = String(resp.error).toLowerCase()
        if (err.includes("popup") || err.includes("access_denied")) {
          alert(
            "Please allow pop-ups for TokBoard, then click Continue again.\n\n" +
            "(If you just enabled pop-ups, click Continue once more to reopen Google.)"
          )
          return reject(resp)
        }
        return reject(resp)
      }

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

      // Require BOTH boxes; if missing, alert + force re-consent and WAIT
      let ok = false
      try {
        ok = window.google.accounts.oauth2.hasGrantedAllScopes(
          resp,
          ...REQUIRED_SCOPES
        )
      } catch {}

      if (ok) return resolve(resp)

      if (!showedScopeAlert) {
        showedScopeAlert = true
        alert(
          "TokBoard needs BOTH permissions:\n\n" +
          "• Google Drive (files used with this app)\n" +
          "• Google Sheets (current sheet)\n\n" +
          "Please check both boxes on the next screen."
        )
      }

      attempts += 1
      if (attempts > 1) {
        // User canceled or still missing scopes; let caller trigger another try on click
        return reject(new Error("User did not grant both required scopes"))
      }

      // Wire resolver for the NEXT token and force consent with both scopes
      tokenResolver = { resolve: onToken, reject }
      try {
        tokenClient.requestAccessToken({
          scope: REQUIRED_SCOPES.join(" "),
          prompt: "consent",
          include_granted_scopes: true,
        })
      } catch (err) {
        return reject(err)
      }
    }

    // Wire resolver for the FIRST token and request both scopes up front
    tokenResolver = { resolve: onToken, reject }
    try {
      tokenClient.requestAccessToken({
        scope: REQUIRED_SCOPES.join(" "),
        prompt, // "" (silent if possible) or "consent" from a user click
      })
    } catch (err) {
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
      // Clean up any legacy or default tabs on existing sheets
      await deleteSheetsIfExist(ssid, ["Requests", "Posting Times", "Sheet1"])
      await deleteDefaultSheets(ssid)
      return ssid
    }

    // Create brand-new spreadsheet (first run)
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

    // Mark that we still need to set up sheets/headers — do it after iframe loads.
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
    ["Products", ["Product", "Cost of Product", "Note"]],
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
    } catch (e) {
      // Already exists — ignore
    }

    await with403Retry(() =>
      window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: ssid,
        range: `'${title}'!A1`,
        valueInputOption: "RAW",
        resource: { values: [headers] },
      })
    )
  }

  // After creating our tabs, remove any default "Sheet"/"Sheet1"/"Sheet 1"/"Sheet2" tabs
  await sleep(200)
  await deleteDefaultSheets(ssid)
}

// (Kept for local tabs use; also wrapped writes in retry)
const inflightReads = new Map()

export async function readTab(ssid, tab) {
  const key = `${ssid}::${tab}`
  if (inflightReads.has(key)) return inflightReads.get(key)

  const p = window.gapi.client.sheets.spreadsheets.values
    .get({
      spreadsheetId: ssid,
      range: `${tab}!A:Z`,
    })
    .then((resp) => {
      const rows = resp.result.values || []
      if (!rows.length) return []
      const [headers, ...data] = rows
      const mapped = data.map((r) =>
        Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
      )
      return mapped
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
