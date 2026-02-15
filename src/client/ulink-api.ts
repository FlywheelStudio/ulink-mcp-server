import { getApiKey } from "../auth/api-key.js";
import {
  browserOAuthFlow,
  refreshAccessToken,
  type OAuthTokens,
} from "../auth/oauth.js";
import { loadTokensFromDisk, saveTokensToDisk } from "../auth/token-store.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE = process.env.ULINK_API_URL ?? "https://api.ulink.ly";

const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // refresh 30 s before expiry

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Token state
// ---------------------------------------------------------------------------

let oauthTokens: OAuthTokens | undefined;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function ensureAuth(): Promise<{ header: string; value: string }> {
  // 1. API-key takes precedence
  const apiKey = getApiKey();
  if (apiKey) {
    return { header: "x-app-key", value: apiKey };
  }

  // 2. OAuth — try disk first, then browser
  if (!oauthTokens) {
    oauthTokens = loadTokensFromDisk();
  }
  if (!oauthTokens) {
    oauthTokens = await browserOAuthFlow();
    saveTokensToDisk(oauthTokens);
  }

  // 3. Auto-refresh if token expires within 30 s
  if (oauthTokens.expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS) {
    try {
      oauthTokens = await refreshAccessToken(oauthTokens.refreshToken);
      saveTokensToDisk(oauthTokens);
    } catch {
      // Refresh failed — re-authenticate via browser
      console.error("Token refresh failed, re-authenticating...");
      oauthTokens = await browserOAuthFlow();
      saveTokensToDisk(oauthTokens);
    }
  }

  return { header: "Authorization", value: `Bearer ${oauthTokens.accessToken}` };
}

// ---------------------------------------------------------------------------
// Generic API request
// ---------------------------------------------------------------------------

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const auth = await ensureAuth();

  const headers: Record<string, string> = {
    [auth.header]: auth.value,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    let message = `API request failed: ${res.status}`;
    try {
      const errorBody = (await res.json()) as { message?: string };
      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // ignore JSON parse failure — use default message
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}
