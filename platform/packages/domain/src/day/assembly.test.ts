import { describe, expect, it } from "vitest";
import { DAILY, WEEKEND, bit } from "../recurrence";
import { dateStart } from "../time/day";
import { ev, task } from "../tools/fixtures";
import type { Task } from "../types";
import { MSK, THU, world } from "./fixtures";
import { projectDay, type DayItem } from "./project";

// Ported from app/src/test/java/com/imprint/app/domain/DayAssemblyTest.kt (7 tests).
const dayRow = (id: string, title: string) => task({ id, title, location: "DAY" });
const repeating = (id: string, title: string, mask = DAILY, startDate: number | null = null, createdAt = 1): Task =>
  task({ id, title, isRepeating: true, recurrenceMask: mask, startDate, createdAt });
const titles = (items: DayItem[]) => items.map((i) => i.title);

describe("projectDay — DayAssemblyTest parity", () => {
  it("mergesRealTasksAndDueRepeating", () => {
    const out = projectDay(world([dayRow("1", "one-off"), repeating("2", "brush teeth")]), THU, MSK);
    expect(titles(out)).toEqual(["one-off", "brush teeth"]);
    expect(out.find((i) => i.id === "2")?.kind).toBe("appearance");
  });

  it("skippedRepeatingIsHidden_othersAppear", () => {
    const state = world([repeating("2", "shows"), repeating("3", "skipped")], [ev({ id: "s", taskId: "3", type: "SKIPPED", dayKey: THU })]);
    expect(titles(projectDay(state, THU, MSK))).toEqual(["shows"]);
  });

  it("excludesOffCadenceRepeating", () => {
    expect(projectDay(world([repeating("3", "monday only", bit(0))]), THU, MSK)).toEqual([]);
  });

  it("startAnchor_gatesRepeatingUntilItArrives", () => {
    const state = world([
      repeating("1", "not yet", DAILY, dateStart("2026-01-18", MSK), 1),
      repeating("2", "starts today", DAILY, dateStart(THU, MSK), 2),
      repeating("3", "already started", DAILY, dateStart("2026-01-14", MSK), 3),
    ]);
    expect(titles(projectDay(state, THU, MSK))).toEqual(["starts today", "already started"]);
  });

  it("pulledRepeating_appearsEvenOffCadence", () => {
    const state = world(
      [repeating("1", "weekend only", WEEKEND), repeating("2", "also weekend only", WEEKEND)],
      [ev({ id: "p", taskId: "1", type: "PULLED_TO_DAY", dayKey: THU })],
    );
    expect(titles(projectDay(state, THU, MSK))).toEqual(["weekend only"]);
  });

  it("sameDaySkip_stillWinsOverAPull — the later event wins, here the skip", () => {
    const state = world(
      [repeating("1", "weekend only", WEEKEND)],
      [
        ev({ id: "p", taskId: "1", type: "PULLED_TO_DAY", dayKey: THU, at: 1 }),
        ev({ id: "s", taskId: "1", type: "SKIPPED", dayKey: THU, at: 2 }),
      ],
    );
    expect(projectDay(state, THU, MSK)).toEqual([]);
  });

  it("neverProducesDuplicateIds — one row is one item, even a routine stored as a DAY row", () => {
    const state = world([task({ id: "7", title: "routine as a DAY row", location: "DAY", isRepeating: true, recurrenceMask: DAILY })]);
    expect(projectDay(state, THU, MSK).map((i) => i.id)).toEqual(["7"]);
  });
});
