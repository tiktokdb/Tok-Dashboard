import React, { useState } from "react"
import { ensureToken, fetchUserEmail } from "./google"

export default function LandingPage({ onSignedIn, error }) {
  const [signingIn, setSigningIn] = useState(false)
  async function handleSignInClick() {
    console.log("🖱️ Sign-In (redirect mode)")
    setSigningIn(true)
    try {
      await ensureToken("consent") // this will redirect to Google
      // If Google returned a token immediately (no redirect), finish sign-in now
      const tok = window.gapi?.client?.getToken?.()
      if (tok?.access_token) {
        console.log("✅ Access token present; fetching email…")
        const em = await fetchUserEmail()
        if (em) {
          console.log("✅ Immediate sign-in; notifying App:", em)
          onSignedIn?.(em)
          setSigningIn(false)
          return
        } else {
          console.warn("⚠️ Token present but no email from userinfo")
          setSigningIn(false)
        }
      } else {
        console.log("↪️ Redirect expected (no immediate token).")
      }

      console.log("↪️ Redirecting to Google…")
    } catch (err) {
      console.error("❌ Sign-in error:", err)
      setSigningIn(false)
    }
  }
  return (
    <div style={{ textAlign: "center", marginTop: 100 }}>
      <h1>Welcome to TokBoard</h1>
      <p>Please sign in with Google to continue.</p>
      <button
        onClick={handleSignInClick}
        disabled={signingIn}
        style={{ padding: "12px 20px", borderRadius: 8, fontWeight: 700 }}
      >
        {signingIn ? "Redirecting…" : "Sign in with Google"}
      </button>
      {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}
    </div>
  )
}
