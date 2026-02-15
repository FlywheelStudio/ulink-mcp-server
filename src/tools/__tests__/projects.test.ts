import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../client/ulink-api.js", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../client/ulink-api.js";
import { registerProjectTools } from "../projects.js";

const mockedApiRequest = vi.mocked(apiRequest);

describe("Project tools", () => {
  let getHandler: ReturnType<typeof createMockServer>["getHandler"];

  beforeEach(() => {
    const mock = createMockServer();
    getHandler = mock.getHandler;
    registerProjectTools(mock.server);
  });

  // ---------------------------------------------------------------------------
  // list_projects
  // ---------------------------------------------------------------------------
  describe("list_projects", () => {
    it("calls GET /projects and returns formatted JSON", async () => {
      const data = [{ id: "p1", name: "Project 1" }];
      mockedApiRequest.mockResolvedValue(data);

      const handler = getHandler("list_projects");
      const result = await handler({});

      expect(mockedApiRequest).toHaveBeenCalledWith("GET", "/projects");
      expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
      expect(result.isError).toBeUndefined();
    });

    it("returns error content on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Unauthorized"));

      const handler = getHandler("list_projects");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unauthorized");
    });
  });

  // ---------------------------------------------------------------------------
  // get_project
  // ---------------------------------------------------------------------------
  describe("get_project", () => {
    it("calls GET /projects/:id", async () => {
      const data = { id: "p1", name: "My Project" };
      mockedApiRequest.mockResolvedValue(data);

      const handler = getHandler("get_project");
      const result = await handler({ projectId: "p1" });

      expect(mockedApiRequest).toHaveBeenCalledWith("GET", "/projects/p1");
      expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Not found"));

      const handler = getHandler("get_project");
      const result = await handler({ projectId: "bad" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  // ---------------------------------------------------------------------------
  // create_project
  // ---------------------------------------------------------------------------
  describe("create_project", () => {
    it("calls POST /projects with name and default_url", async () => {
      const data = { id: "new-p", name: "New Project" };
      mockedApiRequest.mockResolvedValue(data);

      const handler = getHandler("create_project");
      const result = await handler({
        name: "New Project",
        defaultUrl: "https://example.com",
      });

      expect(mockedApiRequest).toHaveBeenCalledWith("POST", "/projects", {
        name: "New Project",
        default_url: "https://example.com",
      });
      expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Validation error"));

      const handler = getHandler("create_project");
      const result = await handler({
        name: "Test",
        defaultUrl: "https://example.com",
      });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // update_project
  // ---------------------------------------------------------------------------
  describe("update_project", () => {
    it("calls PATCH /projects/:id with only provided fields", async () => {
      mockedApiRequest.mockResolvedValue({ id: "p1", name: "Updated" });

      const handler = getHandler("update_project");
      await handler({ projectId: "p1", name: "Updated" });

      expect(mockedApiRequest).toHaveBeenCalledWith("PATCH", "/projects/p1", {
        name: "Updated",
      });
    });

    it("sends default_url when defaultUrl provided", async () => {
      mockedApiRequest.mockResolvedValue({});

      const handler = getHandler("update_project");
      await handler({ projectId: "p1", defaultUrl: "https://new.com" });

      expect(mockedApiRequest).toHaveBeenCalledWith("PATCH", "/projects/p1", {
        default_url: "https://new.com",
      });
    });

    it("sends both fields when both provided", async () => {
      mockedApiRequest.mockResolvedValue({});

      const handler = getHandler("update_project");
      await handler({
        projectId: "p1",
        name: "New Name",
        defaultUrl: "https://new.com",
      });

      expect(mockedApiRequest).toHaveBeenCalledWith("PATCH", "/projects/p1", {
        name: "New Name",
        default_url: "https://new.com",
      });
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Forbidden"));

      const handler = getHandler("update_project");
      const result = await handler({ projectId: "p1" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // configure_project
  // ---------------------------------------------------------------------------
  describe("configure_project", () => {
    it("calls PATCH /projects/:id/configuration with mapped fields", async () => {
      mockedApiRequest.mockResolvedValue({ configured: true });

      const handler = getHandler("configure_project");
      const result = await handler({
        projectId: "p1",
        androidPackageName: "com.example.app",
        iosBundleIdentifier: "com.example.app",
        iosTeamId: "TEAM123",
        iosDeeplinkSchema: "myapp://",
        androidDeeplinkSchema: "myapp://",
        androidSha256Fingerprints: ["AA:BB:CC"],
      });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "PATCH",
        "/projects/p1/configuration",
        {
          android_package_name: "com.example.app",
          ios_bundle_identifier: "com.example.app",
          ios_team_id: "TEAM123",
          ios_deeplink_schema: "myapp://",
          android_deeplink_schema: "myapp://",
          android_sha256_fingerprints: ["AA:BB:CC"],
        },
      );
      expect(result.content[0].text).toContain("configured");
    });

    it("sends only provided optional fields", async () => {
      mockedApiRequest.mockResolvedValue({});

      const handler = getHandler("configure_project");
      await handler({
        projectId: "p1",
        androidPackageName: "com.test",
      });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "PATCH",
        "/projects/p1/configuration",
        { android_package_name: "com.test" },
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Bad request"));

      const handler = getHandler("configure_project");
      const result = await handler({ projectId: "p1" });

      expect(result.isError).toBe(true);
    });
  });
});
