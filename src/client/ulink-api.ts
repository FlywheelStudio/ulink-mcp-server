import { getApiKey } from "../auth/api-key.js";
import { refreshAccessToken, type OAuthTokens } from "../auth/oauth.js";
import { loadTokensFromDisk, saveTokensToDisk } from "../auth/token-store.js";

// Shown when a data tool is used without valid credentials. Data tools never
// launch the browser flow themselves — the `authenticate` tool is the single
// interactive entry point — so this message routes the model there.
const NOT_AUTHENTICATED_MESSAGE =
  "Not authenticated. Call the 'authenticate' tool to sign in (it opens a browser, or returns a sign-in URL when a browser cannot be opened), then retry.";

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

  // 2. OAuth — use cached tokens only. Never launch the browser flow from a
  //    data tool: that would either pop a surprise browser or, on a headless
  //    machine, block silently with no URL the user can act on. Sign-in is the
  //    `authenticate` tool's job.
  if (!oauthTokens) {
    oauthTokens = loadTokensFromDisk();
  }
  if (!oauthTokens) {
    throw new Error(NOT_AUTHENTICATED_MESSAGE);
  }

  // 3. Auto-refresh if token expires within the buffer.
  if (oauthTokens.expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS) {
    try {
      oauthTokens = await refreshAccessToken(oauthTokens.refreshToken);
      saveTokensToDisk(oauthTokens);
    } catch {
      // Refresh failed — require an explicit re-authentication rather than
      // silently launching the browser flow here.
      oauthTokens = undefined;
      throw new Error(NOT_AUTHENTICATED_MESSAGE);
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
    "X-ULink-Source": "mcp_server",
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
    // Per-status fallbacks, used when the server sends no usable message.
    // These are safe hints, not the authoritative reason for the failure.
    const fallbacks: Record<number, string> = {
      400: "Bad request",
      401: "Authentication failed — re-run the 'authenticate' tool to sign in again",
      403: "Access denied — your account doesn't have permission for this resource",
      404: "Resource not found",
      409: "Conflict — the resource already exists",
      422: "Validation failed",
      429: "Too many requests — please slow down",
    };

    // Read the server's own message when present. NestJS sends `message` as a
    // string, or an array of strings for validation errors.
    let serverMessage: string | undefined;
    try {
      const errorBody = (await res.json()) as { message?: unknown };
      if (Array.isArray(errorBody?.message)) {
        serverMessage = errorBody.message
          .filter((m): m is string => typeof m === "string")
          .join("; ");
      } else if (typeof errorBody?.message === "string") {
        serverMessage = errorBody.message;
      }
      if (serverMessage !== undefined && serverMessage.trim() === "") {
        serverMessage = undefined;
      }
    } catch {
      // non-JSON body — fall back to the safe message
    }

    // Surface the server's message only for request-shape errors (400 bad
    // request, 409 conflict, 422 validation) — these describe the caller's own
    // input, so they are actionable and don't leak backend internals. Auth,
    // not-found, rate-limit and 5xx stay generic so we never relay details like
    // table names, user ids, or stack traces. Either way the HTTP status is
    // always appended, so a real cause is never hidden behind a blanket
    // "Authentication failed" (which previously masked 400/403/404/5xx alike).
    //
    // 409 is the sharpest edge here: a NestJS ConflictException usually carries
    // a clean "already exists" message, but if the API ever lets a raw Postgres
    // driver string through (e.g. `duplicate key value violates unique
    // constraint "users_email_key"`) this would relay the constraint/table name.
    // That is an upstream API-hygiene concern the client can't detect; keep
    // conflict messages human-authored on the API side.
    const revealServerMessage = new Set([400, 409, 422]);
    const base =
      revealServerMessage.has(res.status) && serverMessage
        ? serverMessage
        : (fallbacks[res.status] ?? "Request failed");

    throw new ApiError(res.status, `${base} (HTTP ${res.status})`);
  }

  return (await res.json()) as T;
}
