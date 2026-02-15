import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../client/ulink-api.js", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../client/ulink-api.js";
import { registerApiKeyTools } from "../api-keys.js";

const mockedApiRequest = vi.mocked(apiRequest);

describe("API Key tools", () => {
  let getHandler: ReturnType<typeof createMockServer>["getHandler"];

  beforeEach(() => {
    const mock = createMockServer();
    getHandler = mock.getHandler;
    registerApiKeyTools(mock.server);
  });

  // ---------------------------------------------------------------------------
  // list_api_keys
  // ---------------------------------------------------------------------------
  describe("list_api_keys", () => {
    it("calls GET /api-keys?projectId=:id", async () => {
      const keys = [{ id: "k1", name: "Production" }];
      mockedApiRequest.mockResolvedValue(keys);

      const handler = getHandler("list_api_keys");
      const result = await handler({ projectId: "p1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/api-keys?projectId=p1",
      );
      expect(result.content[0].text).toBe(JSON.stringify(keys, null, 2));
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Unauthorized"));

      const handler = getHandler("list_api_keys");
      const result = await handler({ projectId: "p1" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // create_api_key
  // ---------------------------------------------------------------------------
  describe("create_api_key", () => {
    it("calls POST /api-keys?projectId=:id with name", async () => {
      const newKey = { id: "k2", name: "Staging", key: "sk_..." };
      mockedApiRequest.mockResolvedValue(newKey);

      const handler = getHandler("create_api_key");
      const result = await handler({ projectId: "p1", name: "Staging" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "POST",
        "/api-keys?projectId=p1",
        { name: "Staging" },
      );
      expect(result.content[0].text).toBe(JSON.stringify(newKey, null, 2));
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Limit exceeded"));

      const handler = getHandler("create_api_key");
      const result = await handler({ projectId: "p1", name: "Test" });

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // revoke_api_key
  // ---------------------------------------------------------------------------
  describe("revoke_api_key", () => {
    it("calls DELETE /api-keys/:id", async () => {
      mockedApiRequest.mockResolvedValue(undefined);

      const handler = getHandler("revoke_api_key");
      const result = await handler({ apiKeyId: "k1" });

      expect(mockedApiRequest).toHaveBeenCalledWith("DELETE", "/api-keys/k1");
      expect(result.content[0].text).toContain(
        "Successfully revoked API key k1",
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Not found"));

      const handler = getHandler("revoke_api_key");
      const result = await handler({ apiKeyId: "bad" });

      expect(result.isError).toBe(true);
    });
  });
});
