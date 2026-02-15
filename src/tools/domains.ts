import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "../client/ulink-api.js";

export function registerDomainTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // list_domains
  // -----------------------------------------------------------------------
  server.registerTool(
    "list_domains",
    {
      title: "List Domains",
      description:
        "List all domains associated with a ULink project, including shared domains and any custom domains that have been added. Shows verification status for each domain.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        projectId: z.string().uuid().describe("The project whose domains to list"),
      },
    },
    async ({ projectId }) => {
      try {
        const data = await apiRequest("GET", `/domains/projects/${projectId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as any).message}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // add_domain
  // -----------------------------------------------------------------------
  server.registerTool(
    "add_domain",
    {
      title: "Add Domain",
      description:
        "Add a custom domain to a ULink project. After adding, you must configure DNS records and verify the domain before it can be used for links.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project to add the domain to"),
        host: z.string().describe("The domain hostname to add (e.g. links.example.com)"),
      },
    },
    async ({ projectId, host }) => {
      try {
        const data = await apiRequest("POST", "/domains", { projectId, host });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as any).message}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // verify_domain
  // -----------------------------------------------------------------------
  server.registerTool(
    "verify_domain",
    {
      title: "Verify Domain",
      description:
        "Trigger DNS verification for a custom domain. The domain's DNS records must be correctly configured before verification will succeed. Returns the current verification status.",
      inputSchema: {
        domainId: z.string().uuid().describe("The unique identifier of the domain to verify"),
      },
    },
    async ({ domainId }) => {
      try {
        const data = await apiRequest("POST", `/domains/${domainId}/verify`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as any).message}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // delete_domain
  // -----------------------------------------------------------------------
  server.registerTool(
    "delete_domain",
    {
      title: "Delete Domain",
      description:
        "Remove a custom domain from a ULink project. Any links using this domain will stop working. This action is irreversible.",
      annotations: { destructiveHint: true },
      inputSchema: {
        domainId: z.string().uuid().describe("The unique identifier of the domain to delete"),
      },
    },
    async ({ domainId }) => {
      try {
        await apiRequest("DELETE", `/domains/${domainId}`);
        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted domain ${domainId}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as any).message}` }],
          isError: true,
        };
      }
    },
  );
}
