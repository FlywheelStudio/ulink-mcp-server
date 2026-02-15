import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest } from "../client/ulink-api.js";

export function registerAccountTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // get_subscription
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_subscription",
    {
      title: "Get Subscription",
      description:
        "Retrieve the active subscription for a specific project, including plan name, billing period, status, and renewal date. Subscriptions are per-project.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        projectId: z
          .string()
          .describe(
            "The project ID to get the subscription for. If omitted, the API returns the subscription for the user's first project.",
          )
          .optional(),
      },
    },
    async ({ projectId }) => {
      try {
        const qs = projectId
          ? `?projectId=${encodeURIComponent(projectId)}`
          : "";
        const data = await apiRequest(
          "GET",
          `/subscriptions/current${qs}`,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // list_plans
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_plans",
    {
      title: "List Plans",
      description:
        "List all available ULink subscription plans with their features, limits, and pricing. Useful for comparing plans or determining upgrade options.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        billingPeriod: z
          .enum(["monthly", "yearly"])
          .optional()
          .describe("Billing period to show pricing for (default: monthly)."),
      },
    },
    async ({ billingPeriod }) => {
      try {
        const qs = billingPeriod
          ? `?billingPeriod=${encodeURIComponent(billingPeriod)}`
          : "";
        const data = await apiRequest("GET", `/subscriptions/plans${qs}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // get_usage
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_usage",
    {
      title: "Get Usage",
      description:
        "Retrieve usage statistics for a specific project's active billing period, including link clicks, links created, and API calls against plan limits. Usage is per-project.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        projectId: z
          .string()
          .describe(
            "The project ID to get usage for. If omitted, the API returns usage for the user's first project.",
          )
          .optional(),
      },
    },
    async ({ projectId }) => {
      try {
        const qs = projectId
          ? `?projectId=${encodeURIComponent(projectId)}`
          : "";
        const data = await apiRequest(
          "GET",
          `/subscriptions/me/usage${qs}`,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
