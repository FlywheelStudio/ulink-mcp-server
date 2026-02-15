import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "../client/ulink-api.js";

export function registerLinkTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // create_link
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_link",
    {
      title: "Create Link",
      description:
        "Create a new smart link in a ULink project. Supports unified links (single URL that routes by platform) and dynamic links (parameterised deep links). You must specify the project, domain, and link type. Optionally set platform-specific URLs, fallback URLs, custom slug, metadata, and parameters.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project to create the link in"),
        domainId: z.string().uuid().describe("The domain to host the link on"),
        type: z
          .enum(["unified", "dynamic"])
          .describe("Link type: 'unified' for smart routing or 'dynamic' for parameterised deep links"),
        slug: z.string().optional().describe("Custom slug for the short URL (auto-generated if omitted)"),
        name: z.string().optional().describe("Human-readable name for the link"),
        iosUrl: z.string().url().startsWith("https://", { message: "URL must use HTTPS" }).optional().describe("URL to open on iOS devices"),
        androidUrl: z.string().url().startsWith("https://", { message: "URL must use HTTPS" }).optional().describe("URL to open on Android devices"),
        fallbackUrl: z.string().url().startsWith("https://", { message: "URL must use HTTPS" }).optional().describe("Fallback URL for unsupported platforms"),
        iosFallbackUrl: z
          .string().url().startsWith("https://", { message: "URL must use HTTPS" })
          .optional()
          .describe("iOS-specific fallback URL (e.g. App Store link)"),
        androidFallbackUrl: z
          .string().url().startsWith("https://", { message: "URL must use HTTPS" })
          .optional()
          .describe("Android-specific fallback URL (e.g. Play Store link)"),
        parameters: z
          .record(z.string())
          .optional()
          .describe("Key-value parameters passed through the deep link"),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("Arbitrary metadata attached to the link"),
      },
    },
    async ({ projectId, domainId, type, slug, name, iosUrl, androidUrl, fallbackUrl, iosFallbackUrl, androidFallbackUrl, parameters, metadata }) => {
      try {
        const body: Record<string, unknown> = { type };
        if (slug !== undefined) body.slug = slug;
        if (name !== undefined) body.name = name;
        if (iosUrl !== undefined) body.iosUrl = iosUrl;
        if (androidUrl !== undefined) body.androidUrl = androidUrl;
        if (fallbackUrl !== undefined) body.fallbackUrl = fallbackUrl;
        if (iosFallbackUrl !== undefined) body.iosFallbackUrl = iosFallbackUrl;
        if (androidFallbackUrl !== undefined) body.androidFallbackUrl = androidFallbackUrl;
        if (parameters !== undefined) body.parameters = parameters;
        if (metadata !== undefined) body.metadata = metadata;

        const qs = domainId ? `?domainId=${encodeURIComponent(domainId)}` : "";
        const data = await apiRequest(
          "POST",
          `/api/v1/projects/${projectId}/links${qs}`,
          body,
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
  // list_links
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_links",
    {
      title: "List Links",
      description:
        "List all links in a ULink project with optional pagination. Returns an array of link objects with their configuration, URLs, and metadata.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        projectId: z.string().uuid().describe("The project whose links to list"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Number of links to skip for pagination (starts at 0)"),
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("Number of links to return (max 100)"),
      },
    },
    async ({ projectId, offset, limit }) => {
      try {
        const params = new URLSearchParams();
        if (offset !== undefined) params.set("offset", String(offset));
        if (limit !== undefined) params.set("limit", String(limit));
        const qs = params.toString();
        const path = `/api/v1/projects/${projectId}/links${qs ? `?${qs}` : ""}`;

        const data = await apiRequest("GET", path);
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
  // get_link
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_link",
    {
      title: "Get Link",
      description:
        "Retrieve detailed information about a specific link by its ID, including all platform URLs, parameters, metadata, and current configuration.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        linkId: z.string().uuid().describe("The unique identifier of the link"),
      },
    },
    async ({ linkId }) => {
      try {
        const data = await apiRequest("GET", `/api/v1/links/${linkId}`);
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
  // update_link
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_link",
    {
      title: "Update Link",
      description:
        "Update an existing link's properties. You can change the name, platform-specific URLs, fallback URLs, parameters, and metadata. Only the fields you provide will be modified.",
      inputSchema: {
        linkId: z.string().uuid().describe("The unique identifier of the link to update"),
        name: z.string().optional().describe("New human-readable name for the link"),
        iosUrl: z.string().url().startsWith("https://", { message: "URL must use HTTPS" }).optional().describe("New URL to open on iOS devices"),
        androidUrl: z.string().url().startsWith("https://", { message: "URL must use HTTPS" }).optional().describe("New URL to open on Android devices"),
        fallbackUrl: z.string().url().startsWith("https://", { message: "URL must use HTTPS" }).optional().describe("New fallback URL for unsupported platforms"),
        iosFallbackUrl: z
          .string().url().startsWith("https://", { message: "URL must use HTTPS" })
          .optional()
          .describe("New iOS-specific fallback URL"),
        androidFallbackUrl: z
          .string().url().startsWith("https://", { message: "URL must use HTTPS" })
          .optional()
          .describe("New Android-specific fallback URL"),
        parameters: z
          .record(z.string())
          .optional()
          .describe("New key-value parameters passed through the deep link"),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("New arbitrary metadata attached to the link"),
      },
    },
    async ({ linkId, name, iosUrl, androidUrl, fallbackUrl, iosFallbackUrl, androidFallbackUrl, parameters, metadata }) => {
      try {
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (iosUrl !== undefined) body.iosUrl = iosUrl;
        if (androidUrl !== undefined) body.androidUrl = androidUrl;
        if (fallbackUrl !== undefined) body.fallbackUrl = fallbackUrl;
        if (iosFallbackUrl !== undefined) body.iosFallbackUrl = iosFallbackUrl;
        if (androidFallbackUrl !== undefined) body.androidFallbackUrl = androidFallbackUrl;
        if (parameters !== undefined) body.parameters = parameters;
        if (metadata !== undefined) body.metadata = metadata;

        const data = await apiRequest("PUT", `/api/v1/links/${linkId}`, body);
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
  // delete_link
  // -----------------------------------------------------------------------
  server.registerTool(
    "delete_link",
    {
      title: "Delete Link",
      description:
        "Permanently delete a link. This is irreversible and the short URL will stop working immediately. Use with caution.",
      annotations: { destructiveHint: true },
      inputSchema: {
        linkId: z.string().uuid().describe("The unique identifier of the link to delete"),
      },
    },
    async ({ linkId }) => {
      try {
        await apiRequest("DELETE", `/api/v1/links/${linkId}`);
        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted link ${linkId}`,
            },
          ],
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
  // get_link_analytics
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_link_analytics",
    {
      title: "Get Link Analytics",
      description:
        "Retrieve click analytics for a specific link. Returns aggregated data such as total clicks, unique clicks, and breakdowns by platform, country, and referrer for the requested time period.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        linkId: z.string().uuid().describe("The unique identifier of the link"),
        period: z
          .enum(["24h", "7d", "30d", "90d"])
          .optional()
          .describe("Time period for analytics data (defaults to 7d)"),
      },
    },
    async ({ linkId, period }) => {
      try {
        const params = new URLSearchParams();
        if (period !== undefined) params.set("period", period);
        const qs = params.toString();
        const path = `/api/v1/links/${linkId}/analytics${qs ? `?${qs}` : ""}`;

        const data = await apiRequest("GET", path);
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
