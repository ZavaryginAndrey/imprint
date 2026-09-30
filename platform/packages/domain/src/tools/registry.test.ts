import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "./define";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";
import { changed } from "./result";

const echo = defineTool({
  name: "echo",
  description: "Echo the text back (test tool).",
  input: z.object({ text: z.string().min(1) }),
  run: (_ctx, i) => changed({ text: i.text }),
});
const noArgs = defineTool({
  name: "no_args",
  description: "Takes no input (test tool).",
  input: z.object({}),
  run: () => changed(),
});
const boom = defineTool({
  name: "boom",
  description: "Always throws (test tool).",
  input: z.object({}),
  run: () => {
    throw new Error("disk full");
  },
});
const tools = [echo, noArgs, boom];

describe("runTool", () => {
  it("runs a tool with validated input", () => {
    expect(runTool(memoryContext(), "echo", { text: "hi" }, tools)).toEqual({ ok: true, changed: true, text: "hi" });
  });

  it("an unknown name is unknown_tool", () => {
    expect(runTool(memoryContext(), "nope", {}, tools)).toMatchObject({ ok: false, error: "unknown_tool" });
  });

  it("invalid input is invalid_input with zod issues", () => {
    const r = runTool(memoryContext(), "echo", { text: "" }, tools);
    expect(r).toMatchObject({ ok: false, error: "invalid_input" });
    expect(Array.isArray((r as { issues: unknown }).issues)).toBe(true);
  });

  it("missing input is treated as {}", () => {
    expect(runTool(memoryContext(), "no_args", undefined, tools)).toMatchObject({ ok: true });
  });

  it("a throwing context/tool becomes storage with the message", () => {
    expect(runTool(memoryContext(), "boom", {}, tools)).toEqual({ ok: false, error: "storage", message: "disk full" });
  });
});

describe("memoryContext", () => {
  it("reads its own writes and ticks the clock by 1ms per call", () => {
    const ctx = memoryContext({ start: 100 });
    expect([ctx.now(), ctx.now()]).toEqual([100, 101]);
    ctx.upsertGroup({ id: "g", name: "G", position: 0, isCollapsed: false, color: 0, createdAt: 1, updatedAt: 1, deletedAt: null });
    expect(ctx.state().groups.map((g) => g.id)).toEqual(["g"]);
    expect(ctx.draft.groups).toHaveLength(1);
  });
});
