import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// SUPABASE_URL HTTPS enforcement
// ---------------------------------------------------------------------------
describe("SUPABASE_URL HTTPS enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects HTTP SUPABASE_URL at module load", async () => {
    process.env.ULINK_SUPABASE_URL = "http://evil.com";
    await expect(import("../oauth.js")).rejects.toThrow(
      "ULINK_SUPABASE_URL must use HTTPS",
    );
    delete process.env.ULINK_SUPABASE_URL;
  });

  it("accepts HTTPS SUPABASE_URL", async () => {
    process.env.ULINK_SUPABASE_URL = "https://custom.supabase.co";
    const mod = await import("../oauth.js");
    expect(mod.refreshAccessToken).toBeDefined();
    delete process.env.ULINK_SUPABASE_URL;
  });
});

describe("refreshAccessToken", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    delete process.env.ULINK_SUPABASE_URL;
    delete process.env.ULINK_SUPABASE_ANON_KEY;
  });

  // Dynamic import to get fresh module state
  async function getRefreshAccessToken() {
    const mod = await import("../oauth.js");
    return mod.refreshAccessToken;
  }

  it("sends refresh token request and returns new tokens", async () => {
    const refreshAccessToken = await getRefreshAccessToken();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      }),
    });

    const now = Date.now();
    const result = await refreshAccessToken("old-refresh-token");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/v1/token?grant_type=refresh_token"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          apikey: expect.any(String),
        }),
        body: JSON.stringify({ refresh_token: "old-refresh-token" }),
      }),
    );

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("new-refresh");
    expect(result.expiresAt).toBeGreaterThanOrEqual(now + 3600 * 1000 - 100);
  });

  it("uses custom SUPABASE_URL when env is set", async () => {
    process.env.ULINK_SUPABASE_URL = "https://custom.supabase.co";
    // Must re-import to pick up env change at module level
    vi.resetModules();
    const mod = await import("../oauth.js");

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "a",
        refresh_token: "r",
        expires_in: 60,
      }),
    });

    await mod.refreshAccessToken("rt");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.supabase.co/auth/v1/token?grant_type=refresh_token",
      expect.any(Object),
    );
  });

  it("uses custom anon key when env is set", async () => {
    process.env.ULINK_SUPABASE_ANON_KEY = "custom-anon-key";
    vi.resetModules();
    const mod = await import("../oauth.js");

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "a",
        refresh_token: "r",
        expires_in: 60,
      }),
    });

    await mod.refreshAccessToken("rt");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "custom-anon-key",
        }),
      }),
    );
  });

  it("throws on non-ok response with safe message (no response body leaked)", async () => {
    const refreshAccessToken = await getRefreshAccessToken();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(refreshAccessToken("bad-token")).rejects.toThrow(
      "Token refresh failed (401)",
    );
    // Verify the error does NOT include response body details
    try {
      await refreshAccessToken("bad-token");
    } catch (err) {
      expect((err as Error).message).not.toContain("Unauthorized");
      expect((err as Error).message).not.toContain("JWT");
    }
  });

  it("throws with status code in error message", async () => {
    const refreshAccessToken = await getRefreshAccessToken();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(refreshAccessToken("rt")).rejects.toThrow("500");
  });

  it("uses default supabase URL when env not set", async () => {
    const refreshAccessToken = await getRefreshAccessToken();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "a",
        refresh_token: "r",
        expires_in: 60,
      }),
    });

    await refreshAccessToken("rt");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("cjgihassfsspxivjtgoi.supabase.co"),
      expect.any(Object),
    );
  });
});
