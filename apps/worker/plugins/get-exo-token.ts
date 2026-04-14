/**
 * get-exo-token.ts
 *
 * Fetches a delegated access token for Exchange Online using device code flow.
 * Prints the token to stdout so you can copy it into your .env as EXO_TOKEN.
 *
 * Usage:
 *   bun run plugins/get-exo-token.ts
 *
 * Requires in .env:
 *   AZURE_CLIENT_ID   — your app registration client ID
 *   AZURE_TENANT_ID   — your tenant ID or domain
 */

// Exchange Admin Center app — required for InvokeCommand REST endpoint
const CLIENT_ID = "ec156f81-f23a-47bd-b16f-9fb2c66420f9";
const TENANT_ID = process.env.AZURE_TENANT_ID;

if (!TENANT_ID) throw new Error("AZURE_TENANT_ID is not set in .env");

const SCOPE = "https://outlook.office365.com/.default";
const DEVICE_CODE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/devicecode`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

// ─── Step 1: Request device code ─────────────────────────────────────────────

const dcResponse = await fetch(DEVICE_CODE_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    scope:     SCOPE,
  }),
});

if (!dcResponse.ok) {
  throw new Error(`Device code request failed: ${await dcResponse.text()}`);
}

const dc = await dcResponse.json() as any;

console.log("\n─────────────────────────────────────────────────");
console.log("  Open this URL in your browser:");
console.log(`\n  ${dc.verification_uri}\n`);
console.log("  Enter this code:");
console.log(`\n  ${dc.user_code}\n`);
console.log("─────────────────────────────────────────────────");
console.log("Waiting for you to sign in...\n");

// ─── Step 2: Poll for token ───────────────────────────────────────────────────

const interval = (dc.interval ?? 5) * 1000;
const expires  = Date.now() + (dc.expires_in ?? 900) * 1000;

while (Date.now() < expires) {
  await new Promise(r => setTimeout(r, interval));

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:   CLIENT_ID,
      grant_type:  "urn:ietf:params:oauth:grant-type:device_code",
      device_code: dc.device_code,
    }),
  });

  const token = await tokenResponse.json() as any;

  if (token.error === "authorization_pending") continue;
  if (token.error === "slow_down") { await new Promise(r => setTimeout(r, interval)); continue; }

  if (token.error) {
    throw new Error(`Token error: ${token.error} — ${token.error_description}`);
  }

  if (token.access_token) {
    console.log("✅ Token acquired!\n");
    console.log("Add this to your .env:\n");
    console.log(`EXO_TOKEN=${token.access_token}`);
    console.log(`\nExpires in: ${Math.round(token.expires_in / 60)} minutes`);
    process.exit(0);
  }
}

throw new Error("Device code expired — run the script again");
