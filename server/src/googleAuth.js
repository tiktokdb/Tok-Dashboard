import { OAuth2Client } from "google-auth-library";

function extractBearerToken(header) {
  const match = String(header || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function createGoogleAuth({ googleClientId }) {
  const oauthClient = new OAuth2Client(googleClientId);

  async function verifyRequest(req) {
    const accessToken = extractBearerToken(req.headers.authorization);
    if (!accessToken) {
      const err = new Error("Missing Google authorization token");
      err.status = 401;
      throw err;
    }

    const tokenInfo = await oauthClient.getTokenInfo(accessToken);
    if (tokenInfo.aud && tokenInfo.aud !== googleClientId) {
      const err = new Error("Google token audience mismatch");
      err.status = 401;
      throw err;
    }

    let email = tokenInfo.email;
    if (!email) {
      const resp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!resp.ok) {
        const err = new Error("Could not verify Google userinfo");
        err.status = 401;
        throw err;
      }
      const userinfo = await resp.json();
      email = userinfo.email;
    }

    if (!email) {
      const err = new Error("Verified Google token did not include an email");
      err.status = 401;
      throw err;
    }

    return { email: String(email).trim().toLowerCase() };
  }

  return { verifyRequest };
}
