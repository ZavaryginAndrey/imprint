import { describe, expect, it } from "vitest";
import { ev } from "../tools/fixtures";
import { THU } from "./fixtures";
import { indexJournal, marksOf } from "./journal";

describe("marksOf", () => {
  it("an unknown task gets a frozen empty value", () => {
    const m = marksOf(indexJournal([], THU), "nope");
    expect(Object.isFrozen(m)).toBe(true);
    expect(m).toEqual({ lastMark: null, lastMarkToday: null, choiceToday: null, backlogToday: false });
  });

  it("indexing a journal never changes the shared empty value", () => {
    indexJournal([ev({ id: "d", taskId: "t", type: "DONE", dayKey: THU })], THU);
    expect(marksOf(indexJournal([], THU), "t").lastMark).toBeNull();
  });
});
