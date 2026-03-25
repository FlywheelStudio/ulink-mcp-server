import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiKey } from "../auth/api-key.js";
import {
  browserOAuthFlow,
  refreshAccessToken,
} from "../auth/oauth.js";
import {
  loadTokensFromDisk,
  loadRefreshTokenFromDisk,
  saveTokensToDisk,
} from "../auth/token-store.js";
import { apiRequest } from "../client/ulink-api.js";

export function registerAuthTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  // check_auth_status
  // -----------------------------------------------------------------------
  server.registerTool(
    "check_auth_status",
    {
      title: "Check Auth Status",
      description:
        "Check whether valid ULink authentication credentials exist. Returns authentication state without triggering any login flow. Call this first to determine if the authenticate tool needs to be called.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      try {
        // 1. Check API key
        const apiKey = getApiKey();
        if (apiKey) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ authenticated: true, method: "api_key" }),
            }],
          };
        }

        // 2. Check disk tokens
        const tokens = loadTokensFromDisk();
        if (tokens) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                authenticated: true,
                method: "oauth",
                expiresAt: tokens.expiresAt,
              }),
            }],
          };
        }

        // 3. Attempt refresh with expired token's refresh token
        const refreshToken = loadRefreshTokenFromDisk();
        if (refreshToken) {
          try {
            const newTokens = await refreshAccessToken(refreshToken);
            saveTokensToDisk(newTokens);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  authenticated: true,
                  method: "oauth",
                  expiresAt: newTokens.expiresAt,
                }),
              }],
            };
          } catch {
            // Refresh failed — fall through to unauthenticated
          }
        }

        // 4. Not authenticated
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              authenticated: false,
              message:
                "Not authenticated. Call the 'authenticate' tool to sign in or create a free ULink account.",
            }),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Error checking auth status: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // authenticate
  // -----------------------------------------------------------------------
  server.registerTool(
    "authenticate",
    {
      title: "Authenticate",
      description:
        "Authenticate with ULink by opening a browser window for sign-in or sign-up. No existing account required — new users can create a free account during this flow. This is the first tool to call if check_auth_status reports no valid credentials. After success, all other ULink tools become usable.",
      annotations: { readOnlyHint: false },
      inputSchema: {},
    },
    async () => {
      try {
        // 1. Check API key
        const apiKey = getApiKey();
        if (apiKey) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                authenticated: true,
                message: "Already authenticated via API key.",
              }),
            }],
          };
        }

        // 2. Check existing tokens
        const existing = loadTokensFromDisk();
        if (existing) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                authenticated: true,
                message:
                  "Already authenticated with ULink. All tools are ready to use.",
              }),
            }],
          };
        }

        // 3. Run browser OAuth flow
        const tokens = await browserOAuthFlow();
        saveTokensToDisk(tokens);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              authenticated: true,
              message:
                "Successfully authenticated with ULink. You can now use all ULink tools to manage projects, links, and domains.",
            }),
          }],
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          content: [{
            type: "text",
            text: `Authentication failed: ${reason}. Please try again.`,
          }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // get_onboarding_status
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_onboarding_status",
    {
      title: "Get Onboarding Status",
      description:
        "Get the onboarding progress for a ULink project, including which setup steps are complete and what to do next. Requires authentication. Use this after creating a project to guide users through setup.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        projectId: z
          .string()
          .describe("The project ID to check onboarding status for."),
      },
    },
    async ({ projectId }) => {
      try {
        // Pre-check: verify auth exists to avoid unexpected browser popup
        const apiKey = getApiKey();
        const tokens = loadTokensFromDisk();
        if (!apiKey && !tokens) {
          return {
            content: [{
              type: "text",
              text: "Not authenticated. Call the 'authenticate' tool first, then retry.",
            }],
            isError: true,
          };
        }

        const data = await apiRequest<Record<string, unknown>>(
          "GET",
          `/projects/${encodeURIComponent(projectId as string)}/onboarding`,
        );

        // Compute next step from boolean flags
        const steps = [
          { key: "domain_setup_completed", step: "domain_setup", desc: "Set up a domain using the add_domain tool" },
          { key: "platform_selection_completed", step: "platform_selection", desc: "Select target platforms using configure_project" },
          { key: "platform_config_completed", step: "platform_config", desc: "Complete platform configuration (bundle ID, package name, etc.)" },
          { key: "platform_implementation_viewed", step: "platform_implementation", desc: "Review platform implementation guide for your selected platforms" },
          { key: "cli_verified", step: "cli_verification", desc: "Verify setup by running 'ulink verify' CLI command" },
          { key: "sdk_setup_viewed", step: "sdk_setup", desc: "Review SDK setup guide for creating and receiving links" },
        ];

        let completedCount = 0;
        let nextStep = "complete";
        let nextStepDescription = "Onboarding complete! You can now create links with create_link.";

        let foundNext = false;
        for (const s of steps) {
          if (data[s.key]) {
            completedCount++;
          } else if (!foundNext) {
            nextStep = s.step;
            nextStepDescription = s.desc;
            foundNext = true;
          }
        }

        const completionPercentage = Math.round((completedCount / steps.length) * 100);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...data,
              nextStep,
              nextStepDescription,
              completedSteps: completedCount,
              totalSteps: steps.length,
              completionPercentage,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    },
  );
}
