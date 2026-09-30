import { describe, expect, it } from "vitest";
import { sandbox } from "./sandbox";
import { msUntilNextDay, project } from "./view";

const base = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e" };
const monday = () => Date.UTC(2026, 8, 28, 12);

describe("project", () => {
  it("Day, Backlog sections, group counters, quick dates", () => {
    const s = sandbox(base, monday);
    const g = s.run("create_group", { name: "Home" }).ids[0];
    s.run("capture_task", { title: "Today", view: "day" });
    s.run("capture_task", { title: "Later", view: { group: g }, date: "2026-10-02" });
    s.run("capture_task", { title: "Loose", view: "backlog" });
    const v = project(s.ctx);
    expect(v.today).toBe("2026-09-28");
    expect(v.day.map((r) => r.title)).toEqual(["Today"]);
    expect(v.backlog.groups[0]).toMatchObject({
      group: { id: g, name: "Home", icon: "tag", colorKey: "amber" },
      tasks: [{ title: "Later", dueKey: "2026-10-02" }],
    });
    expect(v.backlog.ungrouped.map((r) => r.title)).toEqual(["Loose"]);
    expect(v.groups[0]).toMatchObject({ id: g, openCount: 1 });
    expect(v.dayOpen).toBe(1);
    expect(v.backlogOpen).toBe(2);
    expect(v.quick).toEqual({ tomorrow: "2026-09-29", weekend: "2026-10-03", week: "2026-10-05" });
  });

  it("a done Day task stays, flagged, and leaves the open counter", () => {
    const s = sandbox(base, monday);
    const id = s.run("capture_task", { title: "Milk", view: "day" }).ids[0];
    s.run("set_done", { taskId: id, done: true });
    const v = project(s.ctx);
    expect(v.day[0]).toMatchObject({ id, doneToday: true, kind: "row" });
    expect(v.dayOpen).toBe(0);
  });
});

describe("msUntilNextDay", () => {
  it("ms until the user's next reset", () => {
    const now = Date.UTC(2026, 8, 30, 23, 0);
    const v = project(sandbox({ ...base, settings: { timezone: "UTC", resetHour: 4 } }, () => now).ctx);
    expect(msUntilNextDay(v, now)).toBe(5 * 3600_000);
  });
});
