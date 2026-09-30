import { ALL_TOOLS, memoryContext, runTool } from "@imprint/domain";

export interface DomainProbe {
  tools: number;
  added: boolean;
  dayCount: number;
}

/** W1 plumbing check: the domain package runs in the browser bundle (the W4 optimistic store relies on it). */
export function probeDomain(): DomainProbe {
  const ctx = memoryContext();
  const added = runTool(ctx, "add_task", { title: "Hello, platform", where: "day" });
  const day = runTool(ctx, "list_day", {});
  const tasks = day.ok && Array.isArray(day.tasks) ? day.tasks : [];
  return { tools: ALL_TOOLS.length, added: added.ok && added.changed, dayCount: tasks.length };
}
