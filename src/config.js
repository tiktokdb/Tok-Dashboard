// src/config.js

// Read from env (Vite or CRA) with fallback to current literals.
// Once you confirm env vars are working, delete the fallback strings.

const fromVite = (k) => (typeof import.meta !== "undefined" ? import.meta.env?.[k] : undefined);
const fromCRA  = (k) => (typeof process !== "undefined" ? process.env?.[k] : undefined);

export const GOOGLE_CLIENT_ID =
  fromVite("VITE_GOOGLE_CLIENT_ID") ||
  fromCRA("REACT_APP_GOOGLE_CLIENT_ID") ||
  "856193070288-iedge3i2lciqdu74scpofsaogdrmmhcq.apps.googleusercontent.com"; // <-- remove later

export const GOOGLE_API_KEY =
  fromVite("VITE_GOOGLE_API_KEY") ||
  fromCRA("REACT_APP_GOOGLE_API_KEY") ||
  "AIzaSyDnSi3YD8Fmn-FEA7DsKjR5ytsKhkYc9Xs"; // <-- remove later

// Scopes can stay literal; they aren't secret.
export const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
