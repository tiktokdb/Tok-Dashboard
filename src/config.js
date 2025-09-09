// src/config.js
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const GOOGLE_API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY   || "";

// Recommended modern scopes
export const GOOGLE_SCOPES = [
  "openid",                           // standard OpenID Connect
  "email",                            // user’s email address
  "profile",                          // basic profile (name, picture)
  "https://www.googleapis.com/auth/spreadsheets", // read/write sheets
  "https://www.googleapis.com/auth/drive.file",   // create/edit app files
].join(" ");
