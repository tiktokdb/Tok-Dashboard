export function normalizeEmail(email) {
  if (!email) return "";
  const value = String(email).trim().toLowerCase();
  const [rawLocal, rawDomain] = value.split("@");
  if (!rawDomain) return value;

  let local = rawLocal.split("+")[0];
  let domain = rawDomain;

  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }

  return `${local}@${domain}`;
}
