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

async function deleteSheetsIfExist(ssid, titles) {
  try {
    const meta = await window.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: ssid,
      includeGridData: false,
    });
    const toDelete = (meta.result.sheets || [])
      .filter(s => titles.includes(s.properties.title))
      .map(s => s.properties.sheetId);

    if (toDelete.length) {
      await window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssid,
        resource: {
          requests: toDelete.map(id => ({ deleteSheet: { sheetId: id } })),
        },
      });
    }
  } catch (e) {
    console.warn("Could not delete legacy sheets:", e?.message || e);
  }
}

export async function initGoogle({ apiKey, clientId, scopes }) {
  if (gapiInitPromise) {
    return gapiInitPromise
  }

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
      scope: scopes,
      ux_mode: "redirect", // 👈 switched from popup → redirect
      redirect_uri: window.location.origin, // must match Google Console
      callback: (resp) => {

        if (!tokenResolver) {
          return
        }

        if (resp && resp.error) {
          tokenResolver.reject(resp)
        } else {
          tokenResolver.resolve(resp)
        }
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
  if (!token) {
    return null
  }
  const resp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    return null
  }
  const data = await resp.json()
  return (data.email || "").toLowerCase()
}

let creatingPromise = null

export async function findOrCreateSpreadsheet() {
  // if one call is already creating, wait for it
  if (creatingPromise) return creatingPromise

  const cached = sessionStorage.getItem("tokboard_ssid")
  if (cached) {
    return cached
  }

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
      await deleteSheetsIfExist(ssid, ["Requests", "Posting Times", "Sheet1" ]);
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
    ];

    for (const [title, headers] of parts) {
      try {
        await window.gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: ssid,
          resource: { requests: [{ addSheet: { properties: { title } } }] },
        })
      } catch (e) {
      }
      await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: ssid,
        range: `'${title}'!A1`,
        valueInputOption: "RAW",
        resource: { values: [headers] },
      })
    }

    return ssid
  })().finally(() => {
    creatingPromise = null
  })

  return creatingPromise
}

// google.js

const inflightReads = new Map();

export async function readTab(ssid, tab) {
  const key = `${ssid}::${tab}`;

  // if one is already running, return the same promise
  if (inflightReads.has(key)) {
    return inflightReads.get(key);
  }

  const p = window.gapi.client.sheets.spreadsheets.values
    .get({
      spreadsheetId: ssid,
      range: `${tab}!A:Z`,
    })
    .then((resp) => {
      const rows = resp.result.values || [];
      if (!rows.length) {
        return [];
      }
      const [headers, ...data] = rows;
      const mapped = data.map((r) =>
        Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
      );
      return mapped;
    })
    .catch((err) => {
      console.error("❌ readTab error:", err);
      throw err;
    })
    .finally(() => {
      inflightReads.delete(key);
    });

  inflightReads.set(key, p);
  return p;
}

export async function writeTab(ssid, tab, rows) {
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
}
