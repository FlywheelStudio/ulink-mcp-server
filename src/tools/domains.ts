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
        "List all domains associated with a Ulinkly project, including shared domains and any custom domains that have been added. Shows verification status for each domain.",
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
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
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
        "Add a domain to a Ulinkly project. Two kinds are supported: " +
        "(1) shared domains, a free *.shared.ly subdomain (e.g. myapp.shared.ly; pass the full host), " +
        "which work immediately; and (2) custom domains you own (e.g. links.example.com), which require a " +
        "paid plan. A custom domain only works after you add the DNS records listed in this tool's response " +
        "(also shown in the Ulinkly dashboard under Domains) at your DNS provider and then call verify_domain. " +
        "If `type` is omitted it is inferred from the host: *.shared.ly is shared, anything else is custom.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project to add the domain to"),
        host: z
          .string()
          .regex(
            /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i,
            "Invalid domain hostname"
          )
          .describe(
            "The full domain hostname, e.g. links.example.com (custom) or myapp.shared.ly (shared)",
          ),
        type: z
          .enum(["shared", "custom"])
          .optional()
          .describe(
            "Domain type. Optional: inferred from the host when omitted (*.shared.ly is 'shared', otherwise 'custom').",
          ),
      },
    },
    async ({ projectId, host, type }) => {
      try {
        const effectiveType = type ?? inferDomainType(host);
        const data = await apiRequest("POST", "/domains", {
          projectId,
          host,
          type: effectiveType,
        });
        const json = JSON.stringify(data, null, 2);
        const text =
          effectiveType === "custom" ? `${formatCustomDomainSetup(data, host)}\n\n${json}` : json;
        return {
          content: [{ type: "text", text }],
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
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
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
        "Remove a custom domain from a Ulinkly project. Any links using this domain will stop working. This action is irreversible.",
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
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}

/** *.shared.ly hosts are shared domains; everything else is a custom domain. */
export function inferDomainType(host: string): "shared" | "custom" {
  return host.trim().toLowerCase().endsWith(".shared.ly") ? "shared" : "custom";
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

/**
 * Build a human-readable list of the DNS records a custom domain needs, from
 * the fields the API attaches to the POST /domains response.
 */
export function formatCustomDomainSetup(data: unknown, host: string): string {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, any>;
  const records: DnsRecord[] = [];

  const rec = d.recommended_dns_record;
  if (rec && rec.type && rec.value) {
    records.push({ type: String(rec.type), name: String(rec.name ?? host), value: String(rec.value) });
  } else if (Array.isArray(d.a_records) && d.a_records.length > 0) {
    for (const ip of d.a_records) records.push({ type: "A", name: "@", value: String(ip) });
  } else if (d.cname_target) {
    records.push({ type: "CNAME", name: String(d.cname_record_name ?? host), value: String(d.cname_target) });
  }

  if (Array.isArray(d.vercel_verification) && d.vercel_verification.length > 0) {
    for (const v of d.vercel_verification) {
      if (v && v.type && v.value) {
        records.push({ type: String(v.type), name: String(v.domain ?? host), value: String(v.value) });
      }
    }
  } else if (d.uses_vercel_verification && d.txt_record_name && d.verification_token) {
    records.push({ type: "TXT", name: String(d.txt_record_name), value: String(d.verification_token) });
  }

  const domainId = d.id ? ` with domainId ${d.id}` : "";
  const lines = [`Custom domain ${d.host ?? host} added (not yet verified).`];
  if (records.length > 0) {
    lines.push("Add these DNS records at your DNS provider:");
    for (const r of records) lines.push(`- ${r.type}  ${r.name}  ->  ${r.value}`);
  } else {
    lines.push("Open the Ulinkly dashboard (Domains) to see the DNS records to add at your DNS provider.");
  }
  lines.push(
    `Then call verify_domain${domainId}. DNS changes can take a while to propagate; the records are also shown in the dashboard.`,
  );
  return lines.join("\n");
}
