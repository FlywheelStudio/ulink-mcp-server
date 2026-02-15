# ULink MCP Server

> Connect your ULink deep linking projects to Claude Code, Cursor, Windsurf, and other AI assistants.

The [Model Context Protocol](https://modelcontextprotocol.io/introduction) (MCP) standardizes how Large Language Models (LLMs) talk to external services like ULink. It connects AI assistants directly with your ULink account and allows them to perform tasks like managing projects, creating smart links, configuring domains, and more. See the [full list of tools](#tools).

## Setup

### 1. Install the MCP server

Choose your MCP client and run the corresponding command:

**Claude Code:**

```bash
claude mcp add ulink -- npx -y @ulinkly/mcp-server@latest
```

**Cursor:**

Open **Settings > MCP > Add new MCP server**, or add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ulink": {
      "command": "npx",
      "args": ["-y", "@ulinkly/mcp-server@latest"]
    }
  }
}
```

**Windsurf:**

Open **Settings > MCP > Add new MCP server**, or add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "ulink": {
      "command": "npx",
      "args": ["-y", "@ulinkly/mcp-server@latest"]
    }
  }
}
```

If you don't see your MCP client listed above, check your client's MCP documentation and use the following server command:

```
npx -y @ulinkly/mcp-server@latest
```

### 2. Authenticate

The MCP server shares authentication with the [ULink CLI](https://github.com/ulinkly/ulink-cli). If you've already logged in via `ulink login`, the MCP server will use those tokens automatically — no extra login needed.

Otherwise, your MCP client will open a browser window for authentication on first use. Tokens are saved to `~/.ulink/config.json` and shared with the CLI. The session persists and tokens refresh automatically.

#### API Key (alternative)

For CI environments or headless servers, set the `ULINK_API_KEY` environment variable to skip the browser flow:

**Claude Code:**

```bash
claude mcp add ulink -e ULINK_API_KEY=your-api-key -- npx -y @ulinkly/mcp-server@latest
```

**Manual config:**

```json
{
  "mcpServers": {
    "ulink": {
      "command": "npx",
      "args": ["-y", "@ulinkly/mcp-server@latest"],
      "env": {
        "ULINK_API_KEY": "your-api-key"
      }
    }
  }
}
```

You can generate an API key from the ULink dashboard under **Project Settings > API Keys**, or by using the `create_api_key` tool.

### 3. Start building

Once connected, your AI assistant can manage your ULink projects directly. Try asking it to:

- "List my ULink projects"
- "Create a new smart link for my app"
- "Show click analytics for my latest link"
- "Add a custom domain to my project"

## Tools

The following ULink tools are available to the LLM, organized by category.

#### Project Management

- `list_projects`: Lists all ULink projects owned by or shared with the authenticated user.
- `get_project`: Gets detailed information about a specific project, including configuration and membership.
- `create_project`: Creates a new project with a name and default fallback URL.
- `update_project`: Updates the name or default URL of an existing project.
- `configure_project`: Sets platform-specific configuration (iOS bundle ID, Android package name, deeplink schemas, SHA-256 fingerprints).

#### Link Management

- `create_link`: Creates a unified or dynamic smart link with platform-specific URLs, parameters, and metadata.
- `list_links`: Lists all links in a project with pagination.
- `get_link`: Gets detailed information about a specific link.
- `update_link`: Updates a link's URLs, parameters, or metadata.
- `delete_link`: Permanently deletes a link. This is irreversible.
- `get_link_analytics`: Gets click analytics for a link, including total clicks and breakdowns by platform, country, and referrer.

#### Domain Management

- `list_domains`: Lists all domains (shared and custom) associated with a project.
- `add_domain`: Adds a custom domain to a project. Requires DNS configuration and verification.
- `verify_domain`: Triggers DNS verification for a custom domain.
- `delete_domain`: Removes a custom domain from a project. Links using this domain will stop working.

#### API Keys

- `list_api_keys`: Lists all API keys for a project (metadata only, not the key value).
- `create_api_key`: Creates a new API key. The full key is only returned once — store it securely.
- `revoke_api_key`: Permanently revokes an API key. Applications using this key will immediately lose access.

#### Account & Billing

- `get_subscription`: Gets a project's subscription plan, status, and renewal date. Accepts an optional `projectId`.
- `list_plans`: Lists all available subscription plans with pricing and limits. Accepts an optional `billingPeriod` (monthly/yearly).
- `get_usage`: Gets a project's usage statistics for the current billing period (clicks, links, API calls). Accepts an optional `projectId`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ULINK_API_KEY` | — | API key for authentication (skips browser OAuth flow) |

## Requirements

- Node.js 18 or later

## Resources

- [**ULink Documentation**](https://docs.ulink.ly): Learn more about ULink's deep linking platform.
- [**Model Context Protocol**](https://modelcontextprotocol.io/introduction): Learn more about MCP and its capabilities.

## License

MIT
