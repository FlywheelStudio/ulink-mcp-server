import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../auth/api-key.js", () => ({
  getApiKey: vi.fn(),
}));

vi.mock("../../auth/oauth.js", () => ({
  browserOAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("../../auth/token-store.js", () => ({
  loadTokensFromDisk: vi.fn(),
  loadRefreshTokenFromDisk: vi.fn(),
  saveTokensToDisk: vi.fn(),
}));

vi.mock("../../client/ulink-api.js", () => ({
  apiRequest: vi.fn(),
}));

import { getApiKey } from "../../auth/api-key.js";
import { browserOAuthFlow, refreshAccessToken } from "../../auth/oauth.js";
import {
  loadTokensFromDisk,
  loadRefreshTokenFromDisk,
  saveTokensToDisk,
} from "../../auth/token-store.js";
import { apiRequest } from "../../client/ulink-api.js";
import { registerAuthTools } from "../auth.js";

const mockedGetApiKey = vi.mocked(getApiKey);
const mockedBrowserOAuthFlow = vi.mocked(browserOAuthFlow);
const mockedRefreshAccessToken = vi.mocked(refreshAccessToken);
const mockedLoadTokensFromDisk = vi.mocked(loadTokensFromDisk);
const mockedLoadRefreshTokenFromDisk = vi.mocked(loadRefreshTokenFromDisk);
const mockedSaveTokensToDisk = vi.mocked(saveTokensToDisk);
const mockedApiRequest = vi.mocked(apiRequest);

describe("Auth tools", () => {
  let getHandler: ReturnType<typeof createMockServer>["getHandler"];

  beforeEach(() => {
    vi.resetAllMocks();
    const mock = createMockServer();
    getHandler = mock.getHandler;
    registerAuthTools(mock.server);
  });

  // ---------------------------------------------------------------------------
  // check_auth_status
  // ---------------------------------------------------------------------------
  describe("check_auth_status", () => {
    it("returns api_key method when ULINK_API_KEY is set", async () => {
      mockedGetApiKey.mockReturnValue("test-api-key-123");

      const handler = getHandler("check_auth_status");
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(true);
      expect(parsed.method).toBe("api_key");
    });

    it("returns authenticated when valid tokens on disk", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue({
        accessToken: "access-tok",
        refreshToken: "refresh-tok",
        expiresAt: Date.now() + 3600_000,
      });

      const handler = getHandler("check_auth_status");
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(true);
      expect(parsed.method).toBe("oauth");
      expect(parsed.expiresAt).toBeDefined();
    });

    it("attempts refresh when tokens expired but refresh token available", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue(undefined);
      mockedLoadRefreshTokenFromDisk.mockReturnValue("old-refresh-tok");
      const newTokens = {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: Date.now() + 3600_000,
      };
      mockedRefreshAccessToken.mockResolvedValue(newTokens);

      const handler = getHandler("check_auth_status");
      const result = await handler({});

      expect(mockedRefreshAccessToken).toHaveBeenCalledWith("old-refresh-tok");
      expect(mockedSaveTokensToDisk).toHaveBeenCalledWith(newTokens);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(true);
      expect(parsed.method).toBe("oauth");
    });

    it("returns unauthenticated when no tokens and refresh fails", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue(undefined);
      mockedLoadRefreshTokenFromDisk.mockReturnValue("stale-refresh");
      mockedRefreshAccessToken.mockRejectedValue(new Error("Token refresh failed (401)"));

      const handler = getHandler("check_auth_status");
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(false);
      expect(parsed.message).toContain("Not authenticated");
    });

    it("returns unauthenticated when no tokens and no refresh token", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue(undefined);
      mockedLoadRefreshTokenFromDisk.mockReturnValue(undefined);

      const handler = getHandler("check_auth_status");
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(false);
      expect(parsed.message).toContain("Not authenticated");
    });
  });

  // ---------------------------------------------------------------------------
  // authenticate
  // ---------------------------------------------------------------------------
  describe("authenticate", () => {
    it("returns already authenticated when API key set", async () => {
      mockedGetApiKey.mockReturnValue("test-api-key");

      const handler = getHandler("authenticate");
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(true);
      expect(parsed.message).toContain("Already authenticated via API key");
    });

    it("returns already authenticated when valid tokens exist", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue({
        accessToken: "access-tok",
        refreshToken: "refresh-tok",
        expiresAt: Date.now() + 3600_000,
      });

      const handler = getHandler("authenticate");
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(true);
      expect(parsed.message).toContain("Already authenticated");
    });

    it("triggers browserOAuthFlow and saves tokens when no auth exists", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue(undefined);
      const tokens = {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: Date.now() + 3600_000,
      };
      mockedBrowserOAuthFlow.mockResolvedValue(tokens);

      const handler = getHandler("authenticate");
      const result = await handler({});

      expect(mockedBrowserOAuthFlow).toHaveBeenCalled();
      expect(mockedSaveTokensToDisk).toHaveBeenCalledWith(tokens);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.authenticated).toBe(true);
      expect(parsed.message).toContain("Successfully authenticated");
    });

    it("returns error when OAuth times out", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue(undefined);
      mockedBrowserOAuthFlow.mockRejectedValue(
        new Error("OAuth flow timed out after 5 minutes"),
      );

      const handler = getHandler("authenticate");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("timed out");
    });

    it("returns error when OAuth fails", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue(undefined);
      mockedBrowserOAuthFlow.mockRejectedValue(
        new Error("OAuth error: access_denied"),
      );

      const handler = getHandler("authenticate");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Authentication failed");
    });
  });

  // ---------------------------------------------------------------------------
  // get_onboarding_status
  // ---------------------------------------------------------------------------
  describe("get_onboarding_status", () => {
    it("returns error when not authenticated", async () => {
      mockedGetApiKey.mockReturnValue(undefined);
      mockedLoadTokensFromDisk.mockReturnValue(undefined);

      const handler = getHandler("get_onboarding_status");
      const result = await handler({ projectId: "proj-1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not authenticated");
    });

    it("calls correct API endpoint with projectId", async () => {
      mockedGetApiKey.mockReturnValue("test-key");
      mockedApiRequest.mockResolvedValue({
        domain_setup_completed: false,
        platform_selection_completed: false,
        platform_config_completed: false,
        platform_implementation_viewed: false,
        cli_verified: false,
        sdk_setup_viewed: false,
      });

      const handler = getHandler("get_onboarding_status");
      await handler({ projectId: "proj-1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/projects/proj-1/onboarding",
      );
    });

    it("computes nextStep as domain_setup when nothing done", async () => {
      mockedGetApiKey.mockReturnValue("test-key");
      mockedApiRequest.mockResolvedValue({
        domain_setup_completed: false,
        platform_selection_completed: false,
        platform_config_completed: false,
        platform_implementation_viewed: false,
        cli_verified: false,
        sdk_setup_viewed: false,
      });

      const handler = getHandler("get_onboarding_status");
      const result = await handler({ projectId: "proj-1" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.nextStep).toBe("domain_setup");
      expect(parsed.completedSteps).toBe(0);
      expect(parsed.completionPercentage).toBe(0);
    });

    it("computes nextStep as platform_config when first 2 steps done", async () => {
      mockedGetApiKey.mockReturnValue("test-key");
      mockedApiRequest.mockResolvedValue({
        domain_setup_completed: true,
        platform_selection_completed: true,
        platform_config_completed: false,
        platform_implementation_viewed: false,
        cli_verified: false,
        sdk_setup_viewed: false,
      });

      const handler = getHandler("get_onboarding_status");
      const result = await handler({ projectId: "proj-1" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.nextStep).toBe("platform_config");
      expect(parsed.completedSteps).toBe(2);
      expect(parsed.completionPercentage).toBe(33);
    });

    it("returns complete with 100% when all steps done", async () => {
      mockedGetApiKey.mockReturnValue("test-key");
      mockedApiRequest.mockResolvedValue({
        domain_setup_completed: true,
        platform_selection_completed: true,
        platform_config_completed: true,
        platform_implementation_viewed: true,
        cli_verified: true,
        sdk_setup_viewed: true,
      });

      const handler = getHandler("get_onboarding_status");
      const result = await handler({ projectId: "proj-1" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.nextStep).toBe("complete");
      expect(parsed.completedSteps).toBe(6);
      expect(parsed.totalSteps).toBe(6);
      expect(parsed.completionPercentage).toBe(100);
    });
  });
});
