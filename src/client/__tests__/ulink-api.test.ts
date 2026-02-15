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

  it("triggers browser OAuth flow when no API key and no disk tokens", async () => {
    mockedGetApiKey.mockReturnValue(undefined);
    mockedLoadTokensFromDisk.mockReturnValue(undefined);
    const freshTokens: OAuthTokens = {
      accessToken: "browser-token",
      refreshToken: "browser-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    mockedBrowserOAuthFlow.mockResolvedValue(freshTokens);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiRequest("GET", "/test");

    expect(mockedBrowserOAuthFlow).toHaveBeenCalled();
    expect(mockedSaveTokensToDisk).toHaveBeenCalledWith(freshTokens);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer browser-token",
        }),
      }),
    );
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

  it("falls back to browser flow when refresh fails", async () => {
    mockedGetApiKey.mockReturnValue(undefined);
    const nearExpiryTokens: OAuthTokens = {
      accessToken: "old",
      refreshToken: "old-refresh",
      expiresAt: Date.now() + 5_000,
    };
    mockedLoadTokensFromDisk.mockReturnValue(nearExpiryTokens);
    mockedRefreshAccessToken.mockRejectedValue(new Error("refresh failed"));

    const browserTokens: OAuthTokens = {
      accessToken: "browser-fallback",
      refreshToken: "browser-refresh-fallback",
      expiresAt: Date.now() + 3600_000,
    };
    mockedBrowserOAuthFlow.mockResolvedValue(browserTokens);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    // Suppress console.error for "Token refresh failed"
    vi.spyOn(console, "error").mockImplementation(() => {});

    await apiRequest("GET", "/test");

    expect(mockedBrowserOAuthFlow).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer browser-fallback",
        }),
      }),
    );
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

  it("throws ApiError with message from response body", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "Project not found" }),
    });

    await expect(apiRequest("GET", "/projects/999")).rejects.toThrow(
      "Project not found",
    );

    try {
      await apiRequest("GET", "/projects/999");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(404);
    }
  });

  it("throws ApiError with default message when response body has no message", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(apiRequest("GET", "/test")).rejects.toThrow(
      "API request failed: 500",
    );
  });

  it("throws ApiError with default message when response body is not JSON", async () => {
    mockedGetApiKey.mockReturnValue("key");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(apiRequest("GET", "/test")).rejects.toThrow(
      "API request failed: 502",
    );
  });
});
