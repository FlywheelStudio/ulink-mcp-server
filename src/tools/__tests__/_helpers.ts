import { vi } from "vitest";

type ToolCallback = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface ToolRegistration {
  name: string;
  config: Record<string, unknown>;
  handler: ToolCallback;
}

/**
 * Creates a mock McpServer that captures registerTool calls.
 * After calling a registerXxxTools(server) function, use
 * getHandler(name) to get the handler for a specific tool.
 */
export function createMockServer() {
  const tools: ToolRegistration[] = [];

  const server = {
    registerTool: vi.fn(
      (name: string, config: Record<string, unknown>, handler: ToolCallback) => {
        tools.push({ name, config, handler });
      },
    ),
  };

  function getHandler(name: string): ToolCallback {
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `Tool "${name}" not registered. Available: ${tools.map((t) => t.name).join(", ")}`,
      );
    }
    return tool.handler;
  }

  return { server: server as any, getHandler, tools };
}
