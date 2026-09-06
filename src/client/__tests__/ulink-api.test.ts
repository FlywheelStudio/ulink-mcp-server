import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth modules
vi.mock("../../auth/api-key.js", () => ({
  getApiKey: vi.fn(),
}));

vi.mock("../../auth/oauth.js", () => ({
  browserOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("../../auth/token-store.js", () => ({
  loadTokensFromDisk: vi.fn(),
  saveTokensToDisk: vi.fn(),
}));

import { getApiKey } from "../../auth/api-key.js";
import { browserOAuthFlow, refreshAccessToken } from "../../auth/oauth.js";
import { loadTokensFromDisk, saveTokensToDisk } from "../../auth/token-store.js";
import type { OAuthTokens } from "../../auth/oauth.js";

const mockedGetApiKey = vi.mocked(getApiKey);
const mockedBrowserOAuthFlow = vi.mocked(browserOAuthFlow);
const mockedRefreshAccessToken = vi.mocked(refreshAccessToken);
const mockedLoadTokensFromDisk = vi.mocked(loadTokensFromDisk);
const mockedSaveTokensToDisk = vi.mocked(saveTokensToDisk);

const mockFetch = vi.fn();

describe("apiRequest", () => {
  // We need to re-import the module for each test to reset the module-level
  // oauthTokens singleton. Use vi.resetModules() + dynamic import().
  let apiRequest: typeof import("../ulink-api.js").apiRequest;
  let ApiError: typeof import("../ulink-api.js").ApiError;

  beforeEach(async () => {
    vi.stubGlobal("fetch", mockFetch);
    delete process.env.ULINK_API_URL;

    // Reset module-level oauthTokens state
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock("../../auth/api-key.js", () => ({
      getApiKey: mockedGetApiKey,
    }));
    vi.doMock("../../auth/oauth.js", () => ({
      browserOAuthFlow: mockedBrowserOAuthFlow,
      refreshAccessToken: mockedRefreshAccessToken,
    }));
    vi.doMock("../../auth/token-store.js", () => ({
      loadTokensFromDisk: mockedLoadTokensFromDisk,
      saveTokensToDisk: mockedSaveTokensToDisk,
    }));

    const mod = await import("../ulink-api.js");
    apiRequest = mod.apiRequest;
    ApiError = mod.ApiError;
  });

  it("uses API key auth when ULINK_API_KEY is set", async () => {
    mockedGetApiKey.mockReturnValue("my-api-key");
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    });

    const result = await apiRequest("GET", "/projects");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.ulink.ly/projects",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-app-key": "my-api-key",
        }),
      }),
    );
    expect(result).toEqual({ id: 1 });
  });

  it("loads OAuth tokens from disk when no API key", async () => {
    mockedGetApiKey.mockReturnValue(undefined);
    const tokens: OAuthTokens = {
      accessToken: "disk-token",
      refreshToken: "disk-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    mockedLoadTokensFromDisk.mockReturnValue(tokens);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: "test" }),
    });

    await apiRequest("GET", "/test");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer disk-token",
        }),
      }),
    );
  });

  it("throws not-authenticated (without launching the browser) when no API key and no disk tokens", async () => {
    mockedGetApiKey.mockReturnValue(undefined);
    mockedLoadTokensFromDisk.mockReturnValue(undefined);

    await expect(apiRequest("GET", "/test")).rejects.toThrow("Not authenticated");

    // Data tools must never launch the browser flow — that is authenticate's job.
    expect(mockedBrowserOAuthFlow).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("auto-refreshes tokens when near expiry", async () => {
    mockedGetApiKey.mockReturnValue(undefined);
    // Token expires in 10 seconds (< 30s buffer)
    const nearExpiryTokens: OAuthTokens = {
      accessToken: "old-token",
      refreshToken: "old-refresh",
      expiresAt: Date.now() + 10_000,
    };
    mockedLoadTokensFromDisk.mockReturnValue(nearExpiryTokens);

    const refreshedTokens: OAuthTokens = {
      accessToken: "refreshed-token",
      refreshToken: "refreshed-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    mockedRefreshAccessToken.mockResolvedValue(refreshedTokens);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiRequest("GET", "/test");

    expect(mockedRefreshAccessToken).toHaveBeenCalledWith("old-refresh");
    expect(mockedSaveTokensToDisk).toHaveBeenCalledWith(refreshedTokens);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer refreshed-token",
        }),
      }),
    );
  });

  it("throws not-authenticated (without launching the browser) when token refresh fails", async () => {
    mockedGetApiKey.mockReturnValue(undefined);
    const nearExpiryTokens: OAuthTokens = {
      accessToken: "old",
      refreshToken: "old-refresh",
      expiresAt: Date.now() + 5_000,
    };
    mockedLoadTokensFromDisk.mockReturnValue(nearExpiryTokens);
    mockedRefreshAccessToken.mockRejectedValue(new Error("refresh failed"));

    await expect(apiRequest("GET", "/test")).rejects.toThrow("Not authenticated");

    expect(mockedBrowserOAuthFlow).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends Content-Type header and body for POST requests", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ created: true }),
    });

    await apiRequest("POST", "/projects", { name: "Test" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "Test" }),
      }),
    );
  });

  it("does not send Content-Type when no body", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiRequest("GET", "/projects");

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers).not.toHaveProperty("Content-Type");
    expect(callArgs.body).toBeUndefined();
  });

  it("returns undefined for 204 No Content responses", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    });

    const result = await apiRequest("DELETE", "/projects/123");
    expect(result).toBeUndefined();
  });

  it("throws ApiError with safe message for 404 (not backend details)", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "Project xyz not found in database table" }),
    });

    await expect(apiRequest("GET", "/projects/999")).rejects.toThrow(
      "Resource not found",
    );

    try {
      await apiRequest("GET", "/projects/999");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(404);
      // Should NOT contain backend details
      expect((err as Error).message).not.toContain("database table");
    }
  });

  it("passes through validation messages for 422", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "slug must be at least 3 characters" }),
    });

    await expect(apiRequest("GET", "/test")).rejects.toThrow(
      "slug must be at least 3 characters",
    );
  });

  it("returns safe message for 401", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "JWT expired: token is no longer valid" }),
    });

    await expect(apiRequest("GET", "/test")).rejects.toThrow(
      "Authentication failed",
    );
  });

  it("returns safe message for 403", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "User abc123 does not have access" }),
    });

    await expect(apiRequest("GET", "/test")).rejects.toThrow(
      "Access denied",
    );
  });

  it("returns a generic message for 5xx and never leaks backend detail", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "NullPointerException at DatabaseService.java:42" }),
    });

    await expect(apiRequest("GET", "/test")).rejects.toThrow("Request failed");

    try {
      await apiRequest("GET", "/test");
    } catch (err) {
      expect((err as InstanceType<typeof ApiError>).status).toBe(500);
      // The server's 5xx message must not be surfaced.
      expect((err as Error).message).not.toContain("NullPointerException");
      // The status is always visible.
      expect((err as Error).message).toContain("HTTP 500");
    }
  });

  it("surfaces the server message for request-shape errors (400)", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Project ID is required." }),
    });

    // A 400 previously showed only "Bad request", masking the real cause.
    await expect(apiRequest("GET", "/api-keys")).rejects.toThrow(
      "Project ID is required.",
    );
    await expect(apiRequest("GET", "/api-keys")).rejects.toThrow("HTTP 400");
  });

  it("surfaces the server message for conflicts (409) with the status", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: "A link with this slug already exists." }),
    });

    // 409 is in revealServerMessage: a human-authored conflict message is
    // actionable and is shown, always with the HTTP status appended.
    await expect(apiRequest("POST", "/links")).rejects.toThrow(
      "A link with this slug already exists.",
    );
    await expect(apiRequest("POST", "/links")).rejects.toThrow("HTTP 409");
  });

  it("joins array validation messages (422) and shows the status", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: ["name should not be empty", "name must be a string"] }),
    });

    await expect(apiRequest("POST", "/test")).rejects.toThrow(
      "name should not be empty; name must be a string",
    );
  });

  it("keeps a non-2xx status visible even when the message is generic (401)", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "JWT expired: token is no longer valid" }),
    });

    // Still generic (no backend detail), but the status is no longer hidden —
    // so a 401 can be told apart from a 400/403 instead of all reading as
    // "Authentication failed".
    await expect(apiRequest("GET", "/test")).rejects.toThrow("HTTP 401");
    try {
      await apiRequest("GET", "/test");
    } catch (err) {
      expect((err as Error).message).not.toContain("JWT expired");
    }
  });

  it("returns generic message when response body is not JSON", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(apiRequest("GET", "/test")).rejects.toThrow("Request failed");
    await expect(apiRequest("GET", "/test")).rejects.toThrow("HTTP 502");
  });
});
