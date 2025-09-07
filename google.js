// google.js

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

export async function initGoogle({ apiKey, clientId, scopes }) {
  if (gapiInitPromise) {
    console.log("⚡ Returning existing Google init")
    return gapiInitPromise
  }

  gapiInitPromise = (async () => {
    console.log("🔧 Initializing Google API...")
    await loadGapi()
    console.log("✅ gapi loaded")

    await new Promise((res) => window.gapi.load("client", res))
    console.log("✅ gapi client library loaded")

    await window.gapi.client.init({
      apiKey,
      discoveryDocs: [
        "https://sheets.googleapis.com/$discovery/rest?version=v4",
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    })
    console.log("✅ gapi client initialized")

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes,
      ux_mode: "redirect", // 👈 switched from popup → redirect
      redirect_uri: window.location.origin, // must match Google Console
      callback: (resp) => {
        console.log("🔄 Token callback fired:", resp)

        if (!tokenResolver) {
          console.warn("⚠️ Token callback fired but no resolver was set!")
          return
        }

        if (resp && resp.error) {
          console.error("❌ Token error:", resp.error, resp)
          tokenResolver.reject(resp)
        } else {
          console.log("✅ Token granted:", resp)
          tokenResolver.resolve(resp)
        }
        tokenResolver = null
      },
    })

    console.log("🪟 tokenClient created:", tokenClient)
    console.log("🚀 Google API ready")
  })()

  return gapiInitPromise
}

export async function ensureToken(prompt = "") {
  if (!gapiInitPromise) throw new Error("gapi not initialized yet")
  if (!tokenClient) throw new Error("tokenClient not initialized yet")

  console.log("🪟 Requesting access token with prompt:", prompt)
  return new Promise((resolve, reject) => {
    // wrap the resolver so we can set gapi token if it arrived immediately
    tokenResolver = {
      resolve: (resp) => {
        try {
          if (resp?.access_token) {
          // ✅ Tell gapi about the token so Sheets/Drive + userinfo work now
          window.gapi?.client?.setToken({ access_token: resp.access_token })
        }
          // Persist token for refresh (session-only)
          try {
            const expiresAt = Date.now() + ((resp?.expires_in || 3600) - 60) * 1000 // minus 60s buffer
            sessionStorage.setItem(
              "tokboard_token",
              JSON.stringify({ access_token: resp.access_token, expires_at: expiresAt })
            )
            console.log("🧳 Saved token to sessionStorage (expires_at:", new Date(expiresAt).toISOString(), ")")
          } catch (e) {
            console.warn("⚠️ Could not persist token:", e)
          }
        } catch (e) {
          console.warn("⚠️ Could not set gapi token from resp:", e)
        }
        resolve(resp)
      },
      reject,
    }
    try {
      tokenClient.requestAccessToken({ prompt })
      console.log("📤 requestAccessToken() called on tokenClient")
    } catch (err) {
      console.error("❌ Exception when calling requestAccessToken:", err)
      reject(err)
    }
  })
}

export function getAccessToken() {
  const tok = window.gapi.client.getToken()
  console.log("🔑 Current token object:", tok)
  return tok?.access_token || null
}

export async function fetchUserEmail() {
  const token = getAccessToken()
  if (!token) {
    console.log("❌ No token available to fetch user email")
    return null
  }
  console.log("📡 Fetching userinfo with token:", token.substring(0, 10) + "…")
  const resp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    console.log("❌ Failed to fetch userinfo:", resp.status, await resp.text())
    return null
  }
  const data = await resp.json()
  console.log("📧 User email fetched:", data.email)
  return (data.email || "").toLowerCase()
}

export async function findOrCreateSpreadsheet() {
  // ✅ 1) Try cache first
  const cached = sessionStorage.getItem("tokboard_ssid")
  if (cached) {
    console.log("🗂️ Using cached spreadsheet ID:", cached)
    return cached
  }

  console.log("📂 Looking for existing TokBoard spreadsheet...")
  const q =
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and appProperties has { key='tokdashboard' and value='1' }"
  const list = await window.gapi.client.drive.files.list({
    q,
    fields: "files(id,name)",
  })

  if (list.result.files && list.result.files.length) {
    const ssid = list.result.files[0].id
    console.log("✅ Found existing spreadsheet:", ssid)
    sessionStorage.setItem("tokboard_ssid", ssid) // <— cache it
    return ssid
  }

  console.log("📄 No spreadsheet found, creating new one...")
  const created = await window.gapi.client.drive.files.create({
    resource: {
      name: "TokBoard",
      mimeType: "application/vnd.google-apps.spreadsheet",
      appProperties: { tokdashboard: "1" },
    },
    fields: "id",
  })

  const ssid = created.result.id
  console.log("✅ New spreadsheet created:", ssid)
  sessionStorage.setItem("tokboard_ssid", ssid) // <— cache it

  const parts = [
    ["Products", ["Product", "Cost of Product", "Note"]],
    ["Non-Products", ["Studio Invite", "Paid Amount", "Reason", "Date", "Status"]],
    ["Requests", ["Company", "Product", "Collab Message", "Request", "Ad Code Sent", "Notes"]],
    ["Posting Times", ["Day of the Week", "Best Time to Post"]],
  ]

  for (const [title, headers] of parts) {
    try {
      await window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssid,
        resource: { requests: [{ addSheet: { properties: { title } } }] },
      })
      console.log(`✅ Sheet '${title}' created`)
    } catch (e) {
      console.log(`ℹ️ Sheet '${title}' may already exist`, e.message)
    }
    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: ssid,
      range: `'${title}'!A1`,
      valueInputOption: "RAW",
      resource: { values: [headers] },
    })
    console.log(`✅ Headers set for '${title}'`)
  }

  return ssid
}

export async function readTab(ssid, tab) {
  console.log(`📖 Reading tab '${tab}' from spreadsheet ${ssid}`)
  const resp = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: ssid,
    range: `${tab}!A:Z`,
  })
  const rows = resp.result.values || []
  if (!rows.length) {
    console.log(`⚠️ Tab '${tab}' is empty`)
    return []
  }
  const [headers, ...data] = rows
  const mapped = data.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
  )
  console.log(`✅ Loaded ${mapped.length} rows from '${tab}'`)
  return mapped
}

export async function writeTab(ssid, tab, rows) {
  console.log(`✍️ Writing ${rows.length} rows to tab '${tab}' in spreadsheet ${ssid}`)
  if (!rows.length) return
  const headers = Object.keys(rows[0] || {})
  const values = [headers, ...rows.map((r) => headers.map((h) => `${r[h] ?? ""}`))]
  await window.gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: ssid,
    range: `${tab}!A:Z`,
  })
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: ssid,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    resource: { values },
  })
  console.log(`✅ Tab '${tab}' updated`)
}
