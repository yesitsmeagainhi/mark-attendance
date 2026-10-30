// One-time helper: sign in with Google and print the GOOGLE_REFRESH_TOKEN for backups.
// Run on a computer with a web browser (not the server), passing the JSON file
// downloaded from Google Cloud Console > Credentials (OAuth client, type Desktop app):
//   npm run backup:google-auth -- "C:\Users\you\Downloads\client_secret_xxx.json"
// (or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env and run without a file)
import { createServer } from "node:http";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

let clientId = process.env.GOOGLE_CLIENT_ID;
let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

const jsonPath = process.argv[2];
if (jsonPath) {
  if (!existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }
  const json = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, { client_id?: string; client_secret?: string }>;
  if (json.web && !json.installed) {
    console.error('This client is type "Web application". Create a new OAuth client ID with Application type "Desktop app", download its JSON and use that instead.');
    process.exit(1);
  }
  clientId = json.installed?.client_id;
  clientSecret = json.installed?.client_secret;
}

if (!clientId || !clientSecret) {
  console.error('Pass the downloaded client_secret_....json file: npm run backup:google-auth -- "path\\to\\client_secret.json"');
  console.error("(Google Cloud Console > APIs & Services > Credentials > OAuth client ID, type Desktop app > Download JSON)");
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}`;
// drive.file: the app can only see files and folders it created itself
const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/drive.file",
  access_type: "offline",
  prompt: "consent",
});

const server = createServer(async (req, res) => {
  const code = new URL(req.url || "/", redirectUri).searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("No code received. Close this tab and try again.");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const data = (await tokenRes.json()) as { refresh_token?: string; error_description?: string; error?: string };
  if (!data.refresh_token) {
    res.writeHead(500).end("Google did not return a refresh token. See the terminal.");
    console.error("Failed:", data.error_description || data.error || data);
    server.close();
    process.exitCode = 1;
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" }).end("<h2>Done. You can close this tab and go back to the terminal.</h2>");
  console.log("\nSuccess. Add these lines to the .env file on the server:\n");
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}\n`);
  server.close();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this link in your browser and sign in with the Google account that should store the backups:\n");
  console.log(authUrl + "\n");
});
