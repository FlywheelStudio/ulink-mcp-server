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

if (!API_BASE.startsWith("https://")) {
  throw new Error(
    "ULINK_API_URL must use HTTPS to protect credentials in transit",
  );
}

const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // refresh 30 s before expiry

// ---------------------------------------------------------------------------
// Client-side rate limiter — sliding window
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 30; // max requests per window
const RATE_LIMIT_WINDOW_MS = 10_000; // 10-second window
const requestTimestamps: number[] = [];

function enforceRateLimit(): void {
  const now = Date.now();
  // Remove timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT_MAX) {
    throw new ApiError(
      429,
      `Client rate limit reached (${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s). Please slow down.`,
    );
  }
  requestTimestamps.push(now);
}

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
  enforceRateLimit();

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
    // Map status codes to safe messages to avoid leaking backend details
    const safeMessages: Record<number, string> = {
      400: "Bad request",
      401: "Authentication failed — please re-authenticate",
      403: "Access denied — you don't have permission for this resource",
      404: "Resource not found",
      409: "Conflict — resource already exists",
      422: "Validation failed",
      429: "Too many requests — please slow down",
    };

    let message = safeMessages[res.status] ?? `Request failed (${res.status})`;
    try {
      const errorBody = (await res.json()) as { message?: string };
      // Only pass through validation messages (422) which help the user fix input
      if (res.status === 422 && errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // ignore JSON parse failure — use safe message
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}
