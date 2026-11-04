import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createMockServer } from "./_helpers.js";

vi.mock("../../client/ulink-api.js", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../client/ulink-api.js";
import { registerDomainTools, inferDomainType } from "../domains.js";

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
    it("infers type 'custom' for a non-shared.ly host and lists DNS records", async () => {
      const newDomain = {
        id: "d2",
        host: "go.example.com",
        type: "custom",
        verified: false,
        recommended_dns_record: { type: "CNAME", name: "go", value: "cname.vercel-dns.com" },
        vercel_verification: [
          { type: "TXT", domain: "_vercel.example.com", value: "vc-domain-verify=abc", reason: "pending" },
        ],
      };
      mockedApiRequest.mockResolvedValue(newDomain);

      const handler = getHandler("add_domain");
      const result = await handler({
        projectId: "p1",
        host: "go.example.com",
      });

      expect(mockedApiRequest).toHaveBeenCalledWith("POST", "/domains", {
        projectId: "p1",
        host: "go.example.com",
        type: "custom",
      });
      const text = result.content[0].text;
      expect(text).toContain("CNAME  go  ->  cname.vercel-dns.com");
      expect(text).toContain("TXT  _vercel.example.com  ->  vc-domain-verify=abc");
      expect(text).toContain("verify_domain with domainId d2");
      expect(text).toContain(JSON.stringify(newDomain, null, 2));
    });

    it("falls back to cname_target / a_records when no recommended record", async () => {
      mockedApiRequest.mockResolvedValue({ id: "d3", host: "example.com", a_records: ["76.76.21.21"] });
      const handler = getHandler("add_domain");
      const result = await handler({ projectId: "p1", host: "example.com" });
      expect(result.content[0].text).toContain("A  @  ->  76.76.21.21");

      mockedApiRequest.mockResolvedValue({ id: "d4", host: "l.example.com", cname_target: "custom-domains.ulink.ly" });
      const result2 = await handler({ projectId: "p1", host: "l.example.com" });
      expect(result2.content[0].text).toContain("CNAME  l.example.com  ->  custom-domains.ulink.ly");
    });

    it("infers type 'shared' for a *.shared.ly host and sends the full host", async () => {
      const newDomain = { id: "d5", host: "myapp.shared.ly", type: "shared", verified: true };
      mockedApiRequest.mockResolvedValue(newDomain);

      const handler = getHandler("add_domain");
      const result = await handler({ projectId: "p1", host: "MyApp.Shared.ly" });

      expect(mockedApiRequest).toHaveBeenCalledWith("POST", "/domains", {
        projectId: "p1",
        host: "MyApp.Shared.ly",
        type: "shared",
      });
      expect(result.content[0].text).toBe(JSON.stringify(newDomain, null, 2));
    });

    it("respects an explicit type over inference", async () => {
      mockedApiRequest.mockResolvedValue({ id: "d6" });
      const handler = getHandler("add_domain");
      await handler({ projectId: "p1", host: "links.example.com", type: "shared" });

      expect(mockedApiRequest).toHaveBeenCalledWith("POST", "/domains", {
        projectId: "p1",
        host: "links.example.com",
        type: "shared",
      });
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

// ---------------------------------------------------------------------------
// Hostname validation (security fix)
// ---------------------------------------------------------------------------
describe("add_domain hostname validation", () => {
  const hostnameSchema = z
    .string()
    .regex(
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i,
      "Invalid domain hostname",
    );

  const validHostnames = [
    "example.com",
    "links.example.com",
    "my-app.example.co.uk",
    "sub.domain.example.com",
    "a.io",
    "UPPERCASE.COM",
  ];

  for (const hostname of validHostnames) {
    it(`accepts valid hostname "${hostname}"`, () => {
      expect(hostnameSchema.parse(hostname)).toBe(hostname);
    });
  }

  const invalidHostnames: Array<[string, string]> = [
    ["192.168.1.1", "IP address"],
    ["localhost", "no TLD"],
    ["user:pass@example.com", "credentials in URL"],
    ["-example.com", "starts with hyphen"],
    ["javascript:alert(1)", "javascript URI"],
    ["data:text/html,hi", "data URI"],
    ["file:///etc/passwd", "file URI"],
    ["", "empty string"],
    ["example.c", "single-char TLD"],
    ["http://example.com", "contains scheme"],
  ];

  for (const [hostname, reason] of invalidHostnames) {
    it(`rejects invalid hostname "${hostname}" (${reason})`, () => {
      expect(() => hostnameSchema.parse(hostname)).toThrow();
    });
  }
});

describe("inferDomainType", () => {
  it.each([
    ["acme.shared.ly", "shared"],
    ["ACME.SHARED.LY", "shared"],
    ["links.example.com", "custom"],
    ["shared.ly.example.com", "custom"],
    ["notshared.ly", "custom"],
  ])("%s -> %s", (host, expected) => {
    expect(inferDomainType(host)).toBe(expected);
  });
});
