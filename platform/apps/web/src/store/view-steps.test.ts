import { describe, expect, it } from "vitest";
import { sandbox } from "./sandbox";
import { project } from "./view";

const base = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e" };

describe("project — steps on a row", () => {
  it("a row carries its steps and how many are done", () => {
    const s = sandbox(base, () => Date.UTC(2026, 8, 28, 12));
    const id = s.run("capture_task", { title: "Shop", view: "day" }).ids[0];
    const [a] = s.run("add_steps", { taskId: id, steps: ["List", "Go"] }).ids;
    s.run("set_done", { taskId: a, done: true });
    const row = project(s.ctx).day[0];
    expect(row.steps.map((x) => x.task.title)).toEqual(["List", "Go"]);
    expect(row.stepsDone).toBe(1);
  });
});
