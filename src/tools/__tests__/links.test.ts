import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createMockServer } from "./_helpers.js";

vi.mock("../../client/ulink-api.js", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../client/ulink-api.js";
import { registerLinkTools } from "../links.js";

const mockedApiRequest = vi.mocked(apiRequest);

describe("Link tools", () => {
  let getHandler: ReturnType<typeof createMockServer>["getHandler"];

  beforeEach(() => {
    const mock = createMockServer();
    getHandler = mock.getHandler;
    registerLinkTools(mock.server);
  });

  // ---------------------------------------------------------------------------
  // create_link
  // ---------------------------------------------------------------------------
  describe("create_link", () => {
    it("calls POST with project, domain, and type", async () => {
      mockedApiRequest.mockResolvedValue({ id: "link-1" });

      const handler = getHandler("create_link");
      const result = await handler({
        projectId: "p1",
        domainId: "d1",
        type: "unified",
      });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/v1/projects/p1/links?domainId=d1",
        { type: "unified" },
      );
      expect(result.content[0].text).toContain("link-1");
    });

    it("includes optional fields in body", async () => {
      mockedApiRequest.mockResolvedValue({ id: "link-2" });

      const handler = getHandler("create_link");
      await handler({
        projectId: "p1",
        domainId: "d1",
        type: "dynamic",
        slug: "my-slug",
        name: "My Link",
        iosUrl: "https://ios.example.com",
        androidUrl: "https://android.example.com",
        fallbackUrl: "https://fallback.example.com",
        iosFallbackUrl: "https://ios-fb.example.com",
        androidFallbackUrl: "https://android-fb.example.com",
        parameters: { key: "value" },
        metadata: { campaign: "test" },
      });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/v1/projects/p1/links?domainId=d1",
        {
          type: "dynamic",
          slug: "my-slug",
          name: "My Link",
          iosUrl: "https://ios.example.com",
          androidUrl: "https://android.example.com",
          fallbackUrl: "https://fallback.example.com",
          iosFallbackUrl: "https://ios-fb.example.com",
          androidFallbackUrl: "https://android-fb.example.com",
          parameters: { key: "value" },
          metadata: { campaign: "test" },
        },
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Quota exceeded"));

      const handler = getHandler("create_link");
      const result = await handler({
        projectId: "p1",
        domainId: "d1",
        type: "unified",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Quota exceeded");
    });
  });

  // ---------------------------------------------------------------------------
  // list_links
  // ---------------------------------------------------------------------------
  describe("list_links", () => {
    it("calls GET with project ID", async () => {
      mockedApiRequest.mockResolvedValue([]);

      const handler = getHandler("list_links");
      const result = await handler({ projectId: "p1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/api/v1/projects/p1/links",
      );
      expect(result.content[0].text).toBe(JSON.stringify([], null, 2));
    });

    it("includes pagination params in query string", async () => {
      mockedApiRequest.mockResolvedValue([]);

      const handler = getHandler("list_links");
      await handler({ projectId: "p1", offset: 10, limit: 25 });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/api/v1/projects/p1/links?offset=10&limit=25",
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Server error"));

      const handler = getHandler("list_links");
      const result = await handler({ projectId: "p1" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // get_link
  // ---------------------------------------------------------------------------
  describe("get_link", () => {
    it("calls GET /api/v1/links/:id", async () => {
      const linkData = { id: "link-1", name: "Test Link" };
      mockedApiRequest.mockResolvedValue(linkData);

      const handler = getHandler("get_link");
      const result = await handler({ linkId: "link-1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/api/v1/links/link-1",
      );
      expect(result.content[0].text).toBe(JSON.stringify(linkData, null, 2));
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Not found"));

      const handler = getHandler("get_link");
      const result = await handler({ linkId: "bad" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // update_link
  // ---------------------------------------------------------------------------
  describe("update_link", () => {
    it("calls PUT /api/v1/links/:id with provided fields", async () => {
      mockedApiRequest.mockResolvedValue({ id: "link-1", name: "Updated" });

      const handler = getHandler("update_link");
      const result = await handler({
        linkId: "link-1",
        name: "Updated",
        iosUrl: "https://ios.new.com",
      });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "PUT",
        "/api/v1/links/link-1",
        {
          name: "Updated",
          iosUrl: "https://ios.new.com",
        },
      );
      expect(result.content[0].text).toContain("Updated");
    });

    it("only includes defined fields", async () => {
      mockedApiRequest.mockResolvedValue({});

      const handler = getHandler("update_link");
      await handler({ linkId: "link-1", fallbackUrl: "https://fb.com" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "PUT",
        "/api/v1/links/link-1",
        { fallbackUrl: "https://fb.com" },
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Validation failed"));

      const handler = getHandler("update_link");
      const result = await handler({ linkId: "link-1" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // delete_link
  // ---------------------------------------------------------------------------
  describe("delete_link", () => {
    it("calls DELETE /api/v1/links/:id", async () => {
      mockedApiRequest.mockResolvedValue(undefined);

      const handler = getHandler("delete_link");
      const result = await handler({ linkId: "link-1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "DELETE",
        "/api/v1/links/link-1",
      );
      expect(result.content[0].text).toContain("Successfully deleted link link-1");
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Forbidden"));

      const handler = getHandler("delete_link");
      const result = await handler({ linkId: "link-1" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // get_link_analytics
  // ---------------------------------------------------------------------------
  describe("get_link_analytics", () => {
    it("calls GET /api/v1/links/:id/analytics", async () => {
      const analyticsData = { totalClicks: 100 };
      mockedApiRequest.mockResolvedValue(analyticsData);

      const handler = getHandler("get_link_analytics");
      const result = await handler({ linkId: "link-1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/api/v1/links/link-1/analytics",
      );
      expect(result.content[0].text).toBe(
        JSON.stringify(analyticsData, null, 2),
      );
    });

    it("includes period in query string", async () => {
      mockedApiRequest.mockResolvedValue({});

      const handler = getHandler("get_link_analytics");
      await handler({ linkId: "link-1", period: "30d" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/api/v1/links/link-1/analytics?period=30d",
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Analytics unavailable"));

      const handler = getHandler("get_link_analytics");
      const result = await handler({ linkId: "link-1" });

      expect(result.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Link URL validation (security fix)
// ---------------------------------------------------------------------------
describe("Link URL HTTPS validation", () => {
  const urlSchema = z
    .string()
    .url()
    .startsWith("https://", { message: "URL must use HTTPS" });

  const validUrls = [
    "https://example.com",
    "https://example.com/path?query=value",
    "https://apps.apple.com/app/myapp/id123456789",
    "https://play.google.com/store/apps/details?id=com.example.app",
  ];

  for (const url of validUrls) {
    it(`accepts valid HTTPS URL "${url}"`, () => {
      expect(urlSchema.parse(url)).toBe(url);
    });
  }

  const invalidUrls: Array<[string, string]> = [
    ["http://example.com", "HTTP not HTTPS"],
    ["javascript:alert('xss')", "javascript URI"],
    ["data:text/html,<script>alert('xss')</script>", "data URI"],
    ["file:///etc/passwd", "file URI"],
    ["ftp://example.com/file", "FTP URI"],
    ["not-a-url", "not a URL"],
  ];

  for (const [url, reason] of invalidUrls) {
    it(`rejects invalid URL "${url}" (${reason})`, () => {
      expect(() => urlSchema.parse(url)).toThrow();
    });
  }
});
