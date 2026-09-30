import { describe, expect, it } from "vitest";
import { DAILY } from "../recurrence";
import { dateStart } from "../time/day";
import { ev, task } from "../tools/fixtures";
import { MSK, THU, WED, world } from "./fixtures";
import { locate, projectDay } from "./project";

// Ported from app/src/test/java/com/imprint/app/domain/RolloverTest.kt (4 tests). v1 "retire" (a
// tombstone written at the reset) becomes "completed": hidden by the projection, nothing written (ADR 007).
describe("the daily reset as a projection — RolloverTest parity", () => {
  it("retiresFinishedOneShots_keepsUnfinished", () => {
    const state = world(
      [task({ id: "done", title: "done", location: "DAY" }), task({ id: "open", title: "open", location: "DAY" })],
      [ev({ id: "d", taskId: "done", type: "DONE", dayKey: WED })],
    );
    expect(projectDay(state, THU, MSK).map((i) => i.id)).toEqual(["open"]);
    expect(locate(state, "done", THU, MSK)).toEqual({ place: "completed", kind: null });
    expect(state.tasks.find((t) => t.id === "done")?.deletedAt).toBeNull();
  });

  it("neverRetiresRepeatingRows", () => {
    const state = world(
      [task({ id: "rep", location: "DAY", isRepeating: true, recurrenceMask: DAILY })],
      [ev({ id: "d", taskId: "rep", type: "DONE", dayKey: WED })],
    );
    expect(projectDay(state, THU, MSK)).toMatchObject([{ id: "rep", kind: "appearance", doneToday: false }]);
  });

  it("promotesArrivedDue_withEnteredAtEqualToDueDate — the sort key is the start of its date", () => {
    const state = world([task({ id: "yesterday", dueDate: dateStart(WED, MSK) }), task({ id: "today", dueDate: dateStart(THU, MSK) })]);
    expect(projectDay(state, THU, MSK).map((i) => [i.id, i.kind, i.sortKey])).toEqual([
      ["yesterday", "due", dateStart(WED, MSK)],
      ["today", "due", dateStart(THU, MSK)],
    ]);
  });

  it("doesNotPromoteFutureDue", () => {
    const state = world([task({ id: "later", dueDate: dateStart("2026-01-16", MSK) })]);
    expect(projectDay(state, THU, MSK)).toEqual([]);
    expect(locate(state, "later", THU, MSK).place).toBe("backlog");
  });
});
