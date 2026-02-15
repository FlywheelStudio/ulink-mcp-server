import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "../client/ulink-api.js";

export function registerApiKeyTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_api_keys
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_api_keys",
    {
      title: "List API Keys",
      description:
        "List all API keys for a ULink project. API keys are used for server-side and SDK authentication. Returns key metadata (name, prefix, creation date) but never the full key value.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        projectId: z.string().uuid().describe("The project whose API keys to list"),
      },
    },
    async ({ projectId }) => {
      try {
        const data = await apiRequest(
          "GET",
          `/api-keys?projectId=${encodeURIComponent(projectId)}`,
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
  // create_api_key
  // -----------------------------------------------------------------------
  server.registerTool(
    "create_api_key",
    {
      title: "Create API Key",
      description:
        "Create a new API key for a ULink project. The full key value is only returned once in the response and cannot be retrieved again. Store it securely.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project to create the API key for"),
        name: z.string().describe("A descriptive name for the API key (e.g. 'Production Server')"),
      },
    },
    async ({ projectId, name }) => {
      try {
        const data = await apiRequest(
          "POST",
          `/api-keys?projectId=${encodeURIComponent(projectId)}`,
          { name },
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
  // revoke_api_key
  // -----------------------------------------------------------------------
  server.registerTool(
    "revoke_api_key",
    {
      title: "Revoke API Key",
      description:
        "Permanently revoke an API key. Any applications using this key will immediately lose access. This action cannot be undone.",
      annotations: { destructiveHint: true },
      inputSchema: {
        apiKeyId: z.string().uuid().describe("The unique identifier of the API key to revoke"),
      },
    },
    async ({ apiKeyId }) => {
      try {
        await apiRequest("DELETE", `/api-keys/${apiKeyId}`);
        return {
          content: [
            {
              type: "text",
              text: `Successfully revoked API key ${apiKeyId}`,
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
}
