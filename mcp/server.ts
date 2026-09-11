// MCP stdio server. Registers the shared tool manifest and dispatches calls to
// the handlers. Run by Claude Code via .mcp.json.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { TOOLSPECS, toolByName } from "./toolspecs.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const server = new Server(
  { name: "fearchitect", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLSPECS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.params })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const spec = toolByName(req.params.name);
  if (!spec) {
    return { content: [{ type: "text", text: `unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const result = await spec.handler(ROOT, req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
