import type { Group } from "../types";

/**
 * The one order of groups: position, then name by code unit (no locale), then id. The Backlog, the
 * sidebar, `create_group`'s "last group" and `reorder_groups` all read it, so ties never split them.
 */
export function compareGroups(a: Group, b: Group): number {
  return a.position - b.position || cmp(a.name, b.name) || cmp(a.id, b.id);
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
