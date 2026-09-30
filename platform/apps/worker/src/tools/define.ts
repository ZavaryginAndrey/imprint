import { fail, type InputOf, type MergedState, type ToolInput, type ToolResult, type UserSettings } from "@imprint/domain";
import type { QuotaStore } from "./quota";

/**
 * Server tools (ADR 009): asynchronous, worker-only tools such as `suggest_steps`. The domain's `runTool`
 * stays synchronous and isomorphic (ADR 003); these read the committed state and never write rows.
 */
export interface ServerDeps {
  state(): MergedState;
  settings(): UserSettings;
  today(): string;
  quota: QuotaStore;
  /** The model call; null when no key is configured (the feature is off). */
  generate: ((prompt: string) => Promise<string>) | null;
}

export interface ServerToolDef<S extends ToolInput = ToolInput> {
  name: string;
  description: string;
  input: S;
  run(deps: ServerDeps, input: InputOf<S>): Promise<ToolResult>;
}

export function defineServerTool<S extends ToolInput>(def: ServerToolDef<S>): ServerToolDef<S> {
  return def;
}

/** Validate and run; never throws — like the domain's `runTool`. */
export async function runServerTool(deps: ServerDeps, tool: ServerToolDef, raw: unknown): Promise<ToolResult> {
  const parsed = tool.input.safeParse(raw ?? {});
  if (!parsed.success) return fail("invalid_input", { issues: parsed.error.issues });
  try {
    return await tool.run(deps, parsed.data);
  } catch (e) {
    return fail("storage", { message: e instanceof Error ? e.message : String(e) });
  }
}
