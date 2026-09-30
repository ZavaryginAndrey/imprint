import type { ToolContext } from "./context";
import type { ToolDef } from "./define";
import { CAPTURE_TOOLS } from "./capture";
import { GROUP_TOOLS } from "./groups";
import { MOVE_TOOLS } from "./move-task";
import { QUERY_TOOLS } from "./queries";
import { fail, type ToolResult } from "./result";
import { SETTINGS_TOOLS } from "./settings";
import { STEP_TOOLS } from "./steps";
import { TASK_TOOLS } from "./tasks";

/** Every tool, in catalog order. An MCP server iterates this. */
export const ALL_TOOLS: ToolDef[] = [...TASK_TOOLS, ...CAPTURE_TOOLS, ...MOVE_TOOLS, ...STEP_TOOLS, ...GROUP_TOOLS, ...QUERY_TOOLS, ...SETTINGS_TOOLS];

/**
 * Find a tool by name, validate the raw input with its zod schema and run it. Never throws: a bad
 * name, bad input or a throwing context all come back as `{ ok:false, error }`.
 */
export function runTool(
  ctx: ToolContext,
  name: string,
  rawInput: unknown,
  tools: readonly ToolDef[] = ALL_TOOLS,
): ToolResult {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return fail("unknown_tool", { message: name });
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) return fail("invalid_input", { issues: parsed.error.issues });
  try {
    return tool.run(ctx, parsed.data);
  } catch (e) {
    return fail("storage", { message: e instanceof Error ? e.message : String(e) });
  }
}
