import type { Row } from "../store/view";

export type Column = "day" | "backlog";
export interface DragData {
  row: Row;
  from: Column;
}

/**
 * The call a dropped task makes (UX §4). The three rules — the group kept or taken from the filter, the date
 * dropped in the Day — are `move_task`'s; the UI only says where it landed. Null: it landed where it started.
 */
export function dropCall(taskId: string, from: Column, to: Column | null, filter: string): { name: "move_task"; input: Record<string, unknown> } | null {
  if (to === null || to === from) return null;
  const input: Record<string, unknown> = { taskId, to };
  if (to === "backlog" && filter !== "all") input.filterGroupId = filter;
  return { name: "move_task", input };
}

/** The group order after dragging `active` onto `over` — `reorder_groups` takes the whole list. */
export function reordered(ids: readonly string[], active: string, over: string | null): string[] | null {
  if (over === null || active === over) return null;
  const from = ids.indexOf(active);
  const to = ids.indexOf(over);
  if (from < 0 || to < 0) return null;
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/**
 * A drag starts on any part of a row except the circle, the icons and the date field (UX §4) — and only in the
 * row's own DOM: a press in one of its popovers reaches the row through React's tree, but is no drag.
 */
export function canStartDrag(target: Element): boolean {
  return target.closest("[data-row]") !== null && target.closest("button, input, a, [data-no-drag]") === null;
}

let quiet: HTMLElement | null = null;

/**
 * Where dnd-kit's screen-reader announcer goes: a hidden box, made once. Each DndContext otherwise mounts a
 * second visible `role="status"` next to the toasts' one.
 */
export function quietHost(): HTMLElement {
  if (!quiet || !quiet.isConnected) {
    quiet = document.createElement("div");
    quiet.hidden = true;
    quiet.setAttribute("aria-hidden", "true");
    document.body.append(quiet);
  }
  return quiet;
}
