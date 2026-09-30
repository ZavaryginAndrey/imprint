import { describe, expect, it } from "vitest";
import { ev } from "../tools/fixtures";
import { indexJournal, marksOf } from "./journal";

const TODAY = "2026-09-28";
const lastMark = (events: ReturnType<typeof ev>[]) => marksOf(indexJournal(events, TODAY), "t1").lastMark;

describe("journal order ties break by code unit, not by locale (v1 and the SQL tail)", () => {
  it('equal `at`: deviceId "a" sorts after "B", so its event wins', () => {
    const b = ev({ id: "e1", type: "DONE", at: 5, deviceId: "B" });
    const a = ev({ id: "e2", type: "UNDONE", at: 5, deviceId: "a" });
    expect(lastMark([a, b])?.deviceId).toBe("a");
    expect(lastMark([b, a])?.deviceId).toBe("a");
  });

  it('equal `at` and deviceId: id "e0" sorts after "E1", so its event wins', () => {
    const upper = ev({ id: "E1", type: "DONE", at: 5, deviceId: "phone" });
    const lower = ev({ id: "e0", type: "UNDONE", at: 5, deviceId: "phone" });
    expect(lastMark([lower, upper])?.id).toBe("e0");
    expect(lastMark([upper, lower])?.id).toBe("e0");
  });
});
