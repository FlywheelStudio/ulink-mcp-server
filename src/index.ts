#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerLinkTools } from "./tools/links.js";
import { registerDomainTools } from "./tools/domains.js";
import { registerApiKeyTools } from "./tools/api-keys.js";
import { registerAccountTools } from "./tools/account.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const server = new McpServer({
  name: "ulink",
  version: String(packageJson.version),
});

registerProjectTools(server);
registerLinkTools(server);
registerDomainTools(server);
registerApiKeyTools(server);
registerAccountTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ULink MCP Server running on stdio (21 tools registered)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
