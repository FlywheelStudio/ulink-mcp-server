import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "../client/ulink-api.js";

export function registerProjectTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_projects
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description:
        "List all ULink projects owned by or shared with the authenticated user. Returns an array of project objects including id, name, slug, and default URL.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const data = await apiRequest("GET", "/projects");
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
  // get_project
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_project",
    {
      title: "Get Project",
      description:
        "Retrieve detailed information about a specific ULink project by its ID, including configuration, domains, and membership details.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        projectId: z.string().uuid().describe("The unique identifier of the project"),
      },
    },
    async ({ projectId }) => {
      try {
        const data = await apiRequest("GET", `/projects/${projectId}`);
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
  // create_project
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description:
        "Create a new ULink project. A project is the top-level container for links, domains, and API keys. Requires a name and a default fallback URL.",
      inputSchema: {
        name: z.string().describe("Human-readable name for the project"),
        defaultUrl: z
          .string()
          .url()
          .describe("Default fallback URL used when no platform-specific URL matches"),
      },
    },
    async ({ name, defaultUrl }) => {
      try {
        const data = await apiRequest("POST", "/projects", { name, default_url: defaultUrl });
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
  // update_project
  // -----------------------------------------------------------------------
  server.registerTool(
    "update_project",
    {
      title: "Update Project",
      description:
        "Update the name and/or default URL of an existing ULink project. Only the fields you provide will be changed.",
      inputSchema: {
        projectId: z.string().uuid().describe("The unique identifier of the project to update"),
        name: z.string().optional().describe("New name for the project"),
        defaultUrl: z.string().url().optional().describe("New default fallback URL"),
      },
    },
    async ({ projectId, name, defaultUrl }) => {
      try {
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (defaultUrl !== undefined) body.default_url = defaultUrl;

        const data = await apiRequest("PATCH", `/projects/${projectId}`, body);
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
  // configure_project
  // -----------------------------------------------------------------------
  server.registerTool(
    "configure_project",
    {
      title: "Configure Project",
      description:
        "Update platform-specific configuration for a ULink project, such as iOS bundle identifier, Android package name, deeplink schemas, and SHA-256 fingerprints. These settings are used for deep link resolution on mobile platforms.",
      inputSchema: {
        projectId: z.string().uuid().describe("The unique identifier of the project to configure"),
        androidPackageName: z
          .string()
          .optional()
          .describe("Android package name (e.g. com.example.app)"),
        iosBundleIdentifier: z
          .string()
          .optional()
          .describe("iOS bundle identifier (e.g. com.example.app)"),
        iosTeamId: z.string().optional().describe("Apple Developer Team ID"),
        iosDeeplinkSchema: z
          .string()
          .optional()
          .describe("iOS deeplink URI scheme (e.g. myapp://)"),
        androidDeeplinkSchema: z
          .string()
          .optional()
          .describe("Android deeplink URI scheme (e.g. myapp://)"),
        androidSha256Fingerprints: z
          .array(z.string())
          .optional()
          .describe("SHA-256 certificate fingerprints for Android App Links verification"),
      },
    },
    async ({
      projectId,
      androidPackageName,
      iosBundleIdentifier,
      iosTeamId,
      iosDeeplinkSchema,
      androidDeeplinkSchema,
      androidSha256Fingerprints,
    }) => {
      try {
        const body: Record<string, unknown> = {};
        if (androidPackageName !== undefined) body.android_package_name = androidPackageName;
        if (iosBundleIdentifier !== undefined) body.ios_bundle_identifier = iosBundleIdentifier;
        if (iosTeamId !== undefined) body.ios_team_id = iosTeamId;
        if (iosDeeplinkSchema !== undefined) body.ios_deeplink_schema = iosDeeplinkSchema;
        if (androidDeeplinkSchema !== undefined) body.android_deeplink_schema = androidDeeplinkSchema;
        if (androidSha256Fingerprints !== undefined)
          body.android_sha256_fingerprints = androidSha256Fingerprints;

        const data = await apiRequest(
          "PATCH",
          `/projects/${projectId}/configuration`,
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
}
