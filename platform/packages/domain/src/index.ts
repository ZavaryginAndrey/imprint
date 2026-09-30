/**
 * @imprint/domain — the only home of Imprint's rules (P1). Pure TypeScript: runs in the worker's
 * Durable Object, in the browser (optimistic preview) and in Node tests.
 */
export * from "./types";
export * from "./merge";
export * from "./completion";
export * from "./recurrence";
export * from "./compose";
export * from "./edit";
export * from "./draft";
export * from "./time/index";
export * from "./day/index";
export * from "./group/index";
export * from "./suggest/index";
export { ALL_TOOLS, runTool } from "./tools/index";
export { monotonicClock } from "./tools/support";
export { memoryContext, type MemoryContext, type MemoryOptions } from "./tools/memoryContext";
export type { ToolContext } from "./tools/context";
export { defineTool, type ToolDef, type ToolInput, type InputOf } from "./tools/define";
export { changed, fail, found, unchanged } from "./tools/result";
export type { Reason, ToolError, ToolFail, ToolOk, ToolResult } from "./tools/result";
export { GROUP_PALETTE, colorForId, javaStringHashCode } from "./tools/palette";
