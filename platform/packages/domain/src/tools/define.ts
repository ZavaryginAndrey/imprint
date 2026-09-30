import type { z } from "zod";
import type { ToolContext } from "./context";
import type { ToolResult } from "./result";

/**
 * One tool: a snake_case name, an agent-facing description, a zod object schema for its input and a
 * pure `run`. An MCP server registers it 1:1 (`registerTool(name, { description, inputSchema:
 * input.shape }, …)`).
 */
export interface ToolDef<S extends z.AnyZodObject = z.AnyZodObject> {
  name: string;
  description: string;
  input: S;
  run(ctx: ToolContext, input: z.infer<S>): ToolResult;
}

export function defineTool<S extends z.AnyZodObject>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

/** A tool's input schema — for registries outside the domain (the worker's server tools, ADR 009). */
export type ToolInput = z.AnyZodObject;
export type InputOf<S extends ToolInput> = z.infer<S>;
