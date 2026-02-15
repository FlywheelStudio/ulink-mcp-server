import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockServer } from "./_helpers.js";

vi.mock("../../client/ulink-api.js", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../client/ulink-api.js";
import { registerAccountTools } from "../account.js";

const mockedApiRequest = vi.mocked(apiRequest);

describe("Account tools", () => {
  let getHandler: ReturnType<typeof createMockServer>["getHandler"];

  beforeEach(() => {
    const mock = createMockServer();
    getHandler = mock.getHandler;
    registerAccountTools(mock.server);
  });

  // ---------------------------------------------------------------------------
  // get_subscription
  // ---------------------------------------------------------------------------
  describe("get_subscription", () => {
    it("calls GET /subscriptions/current without projectId", async () => {
      const sub = { plan: "pro", status: "active" };
      mockedApiRequest.mockResolvedValue(sub);

      const handler = getHandler("get_subscription");
      const result = await handler({});

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/subscriptions/current",
      );
      expect(result.content[0].text).toBe(JSON.stringify(sub, null, 2));
    });

    it("includes projectId in query string when provided", async () => {
      mockedApiRequest.mockResolvedValue({});

      const handler = getHandler("get_subscription");
      await handler({ projectId: "p1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/subscriptions/current?projectId=p1",
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Unauthorized"));

      const handler = getHandler("get_subscription");
      const result = await handler({});

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // list_plans
  // ---------------------------------------------------------------------------
  describe("list_plans", () => {
    it("calls GET /subscriptions/plans without billing period", async () => {
      const plans = [{ name: "Free" }, { name: "Pro" }];
      mockedApiRequest.mockResolvedValue(plans);

      const handler = getHandler("list_plans");
      const result = await handler({});

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/subscriptions/plans",
      );
      expect(result.content[0].text).toBe(JSON.stringify(plans, null, 2));
    });

    it("includes billingPeriod in query string", async () => {
      mockedApiRequest.mockResolvedValue([]);

      const handler = getHandler("list_plans");
      await handler({ billingPeriod: "yearly" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/subscriptions/plans?billingPeriod=yearly",
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Server error"));

      const handler = getHandler("list_plans");
      const result = await handler({});

      expect(result.isError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // get_usage
  // ---------------------------------------------------------------------------
  describe("get_usage", () => {
    it("calls GET /subscriptions/me/usage without projectId", async () => {
      const usage = { clicks: 500, linksCreated: 10 };
      mockedApiRequest.mockResolvedValue(usage);

      const handler = getHandler("get_usage");
      const result = await handler({});

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/subscriptions/me/usage",
      );
      expect(result.content[0].text).toBe(JSON.stringify(usage, null, 2));
    });

    it("includes projectId in query string when provided", async () => {
      mockedApiRequest.mockResolvedValue({});

      const handler = getHandler("get_usage");
      await handler({ projectId: "p1" });

      expect(mockedApiRequest).toHaveBeenCalledWith(
        "GET",
        "/subscriptions/me/usage?projectId=p1",
      );
    });

    it("returns error on failure", async () => {
      mockedApiRequest.mockRejectedValue(new Error("Unauthorized"));

      const handler = getHandler("get_usage");
      const result = await handler({});

      expect(result.isError).toBe(true);
    });
  });
});
