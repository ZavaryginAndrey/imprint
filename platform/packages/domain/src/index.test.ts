import { describe, expect, it } from "vitest";
import { ALL_TOOLS, draftToSnapshot, memoryContext, mergeSnapshots, runTool } from "./index";

describe("@imprint/domain barrel", () => {
  it("exposes a non-empty tool catalog with unique names", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it("runs a tool end to end through the barrel", () => {
    const ctx = memoryContext();
    const r = runTool(ctx, "add_task", { title: "Hello", where: "day" });
    expect(r).toMatchObject({ ok: true, changed: true });
    const merged = mergeSnapshots([draftToSnapshot(ctx.draft)]);
    expect(merged.tasks.map((t) => t.title)).toEqual(["Hello"]);
  });
});
