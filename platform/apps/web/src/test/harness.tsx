import { act, render, type RenderResult } from "@testing-library/react";
import type { Group, Task } from "@imprint/domain";
import type { ReactNode } from "react";
import type { Snapshot } from "../platform/api";
import { fakeApi } from "../store/fakeApi";
import { StoreContext } from "../store/hooks";
import { Store } from "../store/store";

/** 2026-09-28 12:00 UTC, a Monday. */
export const MONDAY_NOON = Date.UTC(2026, 8, 28, 12);

export function snapshot(p: Partial<Snapshot> = {}): Snapshot {
  return { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0, language: "ru" }, rev: 1, epoch: "e1", ...p };
}

export function task(p: Partial<Task> & { id: string; title: string }): Task {
  return {
    location: "DAY", dueDate: null, startDate: null, groupId: null, isRepeating: false, recurrenceMask: 0, priority: 0,
    parentId: null, position: 0, createdAt: 1, enteredDayAt: 1, updatedAt: 1, deletedAt: null, ...p,
  };
}

export function group(p: Partial<Group> & { id: string; name: string }): Group {
  return { position: 0, isCollapsed: false, color: 0, colorKey: "amber", icon: "tag", createdAt: 1, updatedAt: 1, deletedAt: null, ...p };
}

/** A component under a started store whose server answers every call with success. */
export async function renderWithStore(ui: ReactNode, snap: Snapshot = snapshot()): Promise<RenderResult & { store: Store; calls: ReturnType<typeof fakeApi>["calls"] }> {
  const f = fakeApi(snap);
  const store = new Store({
    api: f.api, clock: () => MONDAY_NOON, conn: "test", wait: async () => {}, storage: null, offlineAfterMs: 0,
    live: () => ({ close() {} }),
  });
  await act(() => store.start());
  const r = render(<StoreContext.Provider value={store}>{ui}</StoreContext.Provider>);
  return { ...r, store, calls: f.calls };
}
