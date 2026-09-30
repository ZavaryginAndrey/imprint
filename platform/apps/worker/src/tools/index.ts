import type { ServerToolDef } from "./define";
import { suggestSteps } from "./suggestSteps";

export { runServerTool, type ServerDeps, type ServerToolDef } from "./define";

/** Worker-only tools, looked up before the domain's `ALL_TOOLS` (ADR 009). MCP (W5) registers both lists. */
export const SERVER_TOOLS: ServerToolDef[] = [suggestSteps];

export function findServerTool(name: string): ServerToolDef | undefined {
  return SERVER_TOOLS.find((t) => t.name === name);
}
