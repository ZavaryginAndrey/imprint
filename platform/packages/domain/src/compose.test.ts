import { describe, expect, it } from "vitest";
import { buildContribution, startOfDayMillis, type NewTaskInput } from "./compose";
import { draftToSnapshot } from "./draft";

const base: NewTaskInput = { title: "  Купить хлеб  ", toDay: true, groupId: null, dueDate: null, recurrenceMask: 0 };

describe("buildContribution", () => {
  it("Day task: DAY location, enteredDayAt set, no dueDate; trims title", () => {
    const { task, event } = buildContribution(base, "web-1", 1000, "2026-09-18");
    expect(task.title).toBe("Купить хлеб");
    expect(task.location).toBe("DAY");
    expect(task.enteredDayAt).toBe(1000);
    expect(task.dueDate).toBeNull();
    expect(task.createdAt).toBe(1000);
    expect(task.updatedAt).toBe(1000);
    expect(task.deletedAt).toBeNull();
    // CREATED event linked to the task, denormalised fields copied, web deviceId.
    expect(event.type).toBe("CREATED");
    expect(event.taskId).toBe(task.id);
    expect(event.title).toBe("Купить хлеб");
    expect(event.deviceId).toBe("web-1");
    expect(event.dayKey).toBe("2026-09-18");
  });

  it("Backlog task: BACKLOG location, dueDate carried, enteredDayAt null, groupId set", () => {
    const input: NewTaskInput = { title: "Курсовая", toDay: false, groupId: "g1", dueDate: 555, recurrenceMask: 0 };
    const { task } = buildContribution(input, "web-1", 2000);
    expect(task.location).toBe("BACKLOG");
    expect(task.dueDate).toBe(555);
    expect(task.enteredDayAt).toBeNull();
    expect(task.groupId).toBe("g1");
  });

  it("repeating task: BACKLOG definition with the mask, no dueDate/enteredDayAt", () => {
    const input: NewTaskInput = { title: "Витамины", toDay: true, groupId: "g1", dueDate: 555, recurrenceMask: 127 };
    const { task, event } = buildContribution(input, "web-1", 3000);
    expect(task.isRepeating).toBe(true);
    expect(task.recurrenceMask).toBe(127);
    expect(task.location).toBe("BACKLOG"); // repeating ⇒ backlog definition even if toDay was set
    expect(task.dueDate).toBeNull();
    expect(task.enteredDayAt).toBeNull();
    expect(event.isRepeating).toBe(true);
  });

  it("Day task ignores dueDate even if passed", () => {
    const input: NewTaskInput = { ...base, toDay: true, dueDate: 999 };
    expect(buildContribution(input, "web-1", 1).task.dueDate).toBeNull();
  });

  it("mints distinct ids for task and event", () => {
    const c = buildContribution(base, "web-1");
    expect(c.task.id).not.toBe(c.event.id);
    expect(c.task.id.length).toBeGreaterThan(0);
  });
});

describe("startOfDayMillis", () => {
  it("is local midnight for a YYYY-MM-DD", () => {
    const ms = startOfDayMillis("2026-09-18");
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe("draftToSnapshot", () => {
  it("wraps rows in a BackupData with default settings and no groups", () => {
    const { task, event } = buildContribution(base, "web-1", 1);
    const snap = draftToSnapshot({ tasks: [task], events: [event] });
    expect(snap.version).toBe(1);
    expect(snap.tasks).toHaveLength(1);
    expect(snap.events).toHaveLength(1);
    expect(snap.groups).toEqual([]);
    expect(snap.settings.resetHour).toBe(4); // present so BackupJson.decode won't throw
  });
});
