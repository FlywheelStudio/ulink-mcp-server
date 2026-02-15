import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../client/ulink-api.js", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../client/ulink-api.js";
import { registerDomainTools } from "../domains.js";

const mockedApiRequest = vi.mocked(apiRequest);

describe("Domain tools", () => {
  let getHandler: ReturnType<typeof createMockServer>["getHandler"];

  beforeEach(() => {
    const mock = createMockServer();
    getHandler = mock.getHandler;
    registerDomainTools(mock.server);
  });

  // ---------------------------------------------------------------------------
  // list_domains
  // ---------------------------------------------------------------------------
  describe("list_domains", () => {
    it("calls GET /domains/projects/:id", async () => {
      const domains = [{ id: "d1", host: "links.example.com" }];
      mockedApiRequest.mockResolvedValue(domains);

      const handler = getHandler("list_domains");
      const result = await handler({ projectId: "p1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/domains/projects/p1",
      );
      expect(result.content[0].text).toBe(JSON.stringify(domains, null, 2));
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Unauthorized"));

      const handler = getHandler("list_domains");
      const result = await handler({ projectId: "p1" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // add_domain
  // ---------------------------------------------------------------------------
  describe("add_domain", () => {
    it("calls POST /domains with projectId and host", async () => {
      const newDomain = { id: "d2", host: "go.example.com" };
      mockedApiRequest.mockResolvedValue(newDomain);

      const handler = getHandler("add_domain");
      const result = await handler({
        projectId: "p1",
        host: "go.example.com",
      });

      expect(mockedApiRequest).toHaveBeenCalledWith("POST", "/domains", {
        projectId: "p1",
        host: "go.example.com",
      });
      expect(result.content[0].text).toBe(JSON.stringify(newDomain, null, 2));
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Domain already exists"));

      const handler = getHandler("add_domain");
      const result = await handler({ projectId: "p1", host: "dup.com" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // verify_domain
  // ---------------------------------------------------------------------------
  describe("verify_domain", () => {
    it("calls POST /domains/:id/verify", async () => {
      const verifyResult = { verified: true };
      mockedApiRequest.mockResolvedValue(verifyResult);

      const handler = getHandler("verify_domain");
      const result = await handler({ domainId: "d1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "POST",
        "/domains/d1/verify",
      );
      expect(result.content[0].text).toBe(
        JSON.stringify(verifyResult, null, 2),
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(
        new Error("DNS verification failed"),
      );

      const handler = getHandler("verify_domain");
      const result = await handler({ domainId: "d1" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // delete_domain
  // ---------------------------------------------------------------------------
  describe("delete_domain", () => {
    it("calls DELETE /domains/:id", async () => {
      mockedApiRequest.mockResolvedValue(undefined);

      const handler = getHandler("delete_domain");
      const result = await handler({ domainId: "d1" });

      expect(mockedApiRequest).toHaveBeenCalledWith("DELETE", "/domains/d1");
      expect(result.content[0].text).toContain(
        "Successfully deleted domain d1",
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Not found"));

      const handler = getHandler("delete_domain");
      const result = await handler({ domainId: "bad" });

      expect(result.isError).toBe(true);
    });
  });
});
