import { describe, expect, it } from "vitest";
import { ev } from "../tools/fixtures";
import type { TaskEvent } from "../types";
import { indexJournal, journalTail, marksOf } from "./journal";

const TODAY = "2026-01-15";
let seq = 0;
const e = (taskId: string | null, type: string, at: number, dayKey = TODAY, deviceId = "d"): TaskEvent =>
  ev({ id: `e${seq++}`, taskId, type, at, dayKey, deviceId });
const marks = (events: TaskEvent[], taskId: string) => marksOf(indexJournal(events, TODAY), taskId);
const doneToday = (events: TaskEvent[], taskId: string) => marks(events, taskId).lastMarkToday?.type === "DONE";

// Ported from app/src/test/java/com/imprint/app/domain/CompletionTest.kt (5 tests).
describe("indexJournal — CompletionTest parity", () => {
  it("lastDoneWins_overEarlierUndone", () => {
    expect(doneToday([e("t", "DONE", 1), e("t", "UNDONE", 2), e("t", "DONE", 3)], "t")).toBe(true);
  });

  it("undoneAfterDone_isNotDone", () => {
    expect(doneToday([e("t", "DONE", 1), e("t", "UNDONE", 2)], "t")).toBe(false);
  });

  it("orderingIsByTimestamp_notInsertionOrder", () => {
    expect(doneToday([e("t", "DONE", 5), e("t", "UNDONE", 2)], "t")).toBe(true);
  });

  it("skippedIsCollected_andIndependentOfDone", () => {
    const events = [e("a", "SKIPPED", 1), e("b", "DONE", 1)];
    expect(marks(events, "a")).toMatchObject({ choiceToday: "SKIPPED", lastMarkToday: null });
    expect(doneToday(events, "b")).toBe(true);
    expect(marks(events, "b").choiceToday).toBeNull();
  });

  it("taskIndependentEventsAreIgnored", () => {
    expect(indexJournal([e(null, "SHOWN", 1)], TODAY).size).toBe(0);
  });
});

describe("indexJournal — 2.0 additions (ADR 007)", () => {
  it("lastMark spans days; lastMarkToday is only today's", () => {
    const m = marks([e("t", "DONE", 1, "2026-01-10"), e("t", "UNDONE", 2, "2026-01-12")], "t");
    expect(m.lastMark).toMatchObject({ type: "UNDONE", dayKey: "2026-01-12" });
    expect(m.lastMarkToday).toBeNull();
  });

  it("the later of SKIPPED and PULLED_TO_DAY wins; other days do not count", () => {
    expect(marks([e("r", "SKIPPED", 1), e("r", "PULLED_TO_DAY", 2)], "r").choiceToday).toBe("PULLED_TO_DAY");
    expect(marks([e("r", "PULLED_TO_DAY", 1), e("r", "SKIPPED", 2)], "r").choiceToday).toBe("SKIPPED");
    expect(marks([e("r", "SKIPPED", 1, "2026-01-14")], "r").choiceToday).toBeNull();
  });

  it("MOVED_TO_BACKLOG counts only today", () => {
    expect(marks([e("t", "MOVED_TO_BACKLOG", 1)], "t").backlogToday).toBe(true);
    expect(marks([e("t", "MOVED_TO_BACKLOG", 1, "2026-01-14")], "t").backlogToday).toBe(false);
  });

  it("equal timestamps break ties by deviceId, then id", () => {
    const events = [e("t", "DONE", 5, TODAY, "server"), e("t", "UNDONE", 5, TODAY, "phone")];
    expect(marks(events, "t").lastMark?.type).toBe("DONE"); // "server" sorts after "phone"
  });

  it("a task with no events has empty marks", () => {
    expect(marks([], "nope")).toEqual({ lastMark: null, lastMarkToday: null, choiceToday: null, backlogToday: false });
  });
});

describe("journalTail", () => {
  it("keeps each task's last DONE/UNDONE before `since`, and nothing else", () => {
    const events = [
      e("a", "DONE", 1, "2026-01-01"),
      e("a", "UNDONE", 2, "2026-01-02"),
      e("b", "DONE", 3, "2026-01-03"),
      e("b", "CREATED", 4, "2026-01-03"),
      e("c", "DONE", 5, "2026-01-20"),
      e(null, "SHOWN", 6, "2026-01-01"),
    ];
    expect(journalTail(events, "2026-01-10").map((x) => [x.taskId, x.type]).sort()).toEqual([
      ["a", "UNDONE"],
      ["b", "DONE"],
    ]);
  });
});
