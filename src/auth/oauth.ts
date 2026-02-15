import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { URL } from "node:url";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const FRONTEND_URL =
  process.env.ULINK_FRONTEND_URL ?? "https://ulink.ly";

const SUPABASE_URL =
  process.env.ULINK_SUPABASE_URL ?? "https://cjgihassfsspxivjtgoi.supabase.co";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

function successHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ULink CLI</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa}
.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08)}
h1{color:#22c55e;margin:0 0 .5rem}p{color:#555}</style></head>
<body><div class="card"><h1>Authenticated</h1><p>You can close this window and return to your terminal.</p></div></body></html>`;
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ULink CLI — Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa}
.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08)}
h1{color:#ef4444;margin:0 0 .5rem}p{color:#555}</style></head>
<body><div class="card"><h1>Authentication Error</h1><p>${message}</p></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Browser opener
// ---------------------------------------------------------------------------

export function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      execFileSync("open", [url], { stdio: "ignore" });
    } else if (platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    } else {
      // Linux / other
      execFileSync("xdg-open", [url], { stdio: "ignore" });
    }
  } catch {
    console.error(`Could not open browser. Please visit:\n${url}`);
  }
}

// ---------------------------------------------------------------------------
// Browser OAuth PKCE flow
// ---------------------------------------------------------------------------

export function browserOAuthFlow(): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    const sessionId = randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    let settled = false;

    let callbackAttempts = 0;
    const MAX_CALLBACK_ATTEMPTS = 5;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) {
        res.writeHead(400);
        res.end();
        return;
      }

      const parsed = new URL(req.url, `http://127.0.0.1`);

      if (parsed.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      // Rate limit callback attempts
      callbackAttempts++;
      if (callbackAttempts > MAX_CALLBACK_ATTEMPTS) {
        res.writeHead(429, { "Content-Type": "text/html" });
        res.end(errorHtml("Too many callback attempts"));
        return;
      }

      // Validate session ID to prevent CSRF
      const returnedSession = parsed.searchParams.get("session");
      if (returnedSession !== sessionId) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(errorHtml("Invalid session — possible CSRF attempt"));
        return;
      }

      const error = parsed.searchParams.get("error");
      if (error) {
        const desc =
          parsed.searchParams.get("error_description") ?? "Unknown error";
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(errorHtml(desc));
        settled = true;
        server.close();
        reject(new Error(`OAuth error: ${error} — ${desc}`));
        return;
      }

      const accessToken = parsed.searchParams.get("access_token");
      const refreshToken = parsed.searchParams.get("refresh_token");
      const expiresIn = parsed.searchParams.get("expires_in");

      if (!accessToken || !refreshToken || !expiresIn) {
        const msg = "Missing token parameters in callback";
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(errorHtml(msg));
        settled = true;
        server.close();
        reject(new Error(msg));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(successHtml());

      const tokens: OAuthTokens = {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + parseInt(expiresIn, 10) * 1000,
      };

      settled = true;
      server.close();
      resolve(tokens);
    });

    // Listen on a random available port on loopback
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind local server"));
        return;
      }

      const port = addr.port;
      const authUrl =
        `${FRONTEND_URL}/auth/cli` +
        `?session=${encodeURIComponent(sessionId)}` +
        `&code_challenge=${encodeURIComponent(codeChallenge)}` +
        `&code_challenge_method=S256` +
        `&callback_port=${port}` +
        `&source=mcp`;

      console.error(`Opening browser for authentication on localhost:${port}...`);
      openBrowser(authUrl);
    });

    // 5-minute timeout
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new Error("OAuth flow timed out after 5 minutes"));
      }
    }, TIMEOUT_MS);

    // Don't let the timer keep the process alive if the server closes first
    timer.unref();
  });
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  refreshToken: string,
): Promise<OAuthTokens> {
  const EMBEDDED_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqZ2loYXNzZnNzcHhpdmp0Z29pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwNjE0NTUsImV4cCI6MjA2MDYzNzQ1NX0._k-iNnobMaGN1qY8BGM4mMdnGRqOn1R90i_WXUn-Gpw";
  const anonKey = process.env.ULINK_SUPABASE_ANON_KEY ?? EMBEDDED_ANON_KEY;

  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
