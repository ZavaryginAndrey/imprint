import type { Group } from "../types";
import {
  DEFAULT_GROUP_ICON, FIRST_GROUP_COLOR, GROUP_COLORS, GROUP_COLOR_KEYS, isGroupColorKey, isGroupIconKey,
  type GroupColorKey, type GroupIconKey,
} from "./palette";

/** v1 `GroupColors.kt` (packed ARGB) → 2.0 key, as the UX §5 table. indigo and sky both become blue. */
const V1_COLOR_KEYS: ReadonlyMap<number, GroupColorKey> = new Map<number, GroupColorKey>([
  [0xff6c7ae0, "blue"],
  [0xff3f9d8f, "teal"],
  [0xffd98a3d, "amber"],
  [0xffc15b7e, "rose"],
  [0xff7e9a4e, "sage"],
  [0xff9b6bc4, "plum"],
  [0xff4e8fc0, "blue"],
  [0xffc0663f, "terracotta"],
]);

/** The `color` (packed ARGB) stored for a key: its opaque base tone. No key → 0, v1's "no colour". */
export function argbOf(key: GroupColorKey | null): number {
  return key == null ? 0 : 0xff000000 + parseInt(GROUP_COLORS[key].dark.slice(1), 16);
}

/** A stored ARGB → key: the v1 table, then 2.0's own base tones; anything else has no key. */
export function colorKeyFromArgb(argb: number): GroupColorKey | null {
  const unsigned = argb >>> 0; // the phone may hand the colour over as a signed int
  return V1_COLOR_KEYS.get(unsigned) ?? GROUP_COLOR_KEYS.find((k) => argbOf(k) === unsigned) ?? null;
}

export interface GroupLook {
  colorKey: GroupColorKey | null;
  icon: GroupIconKey;
}

/** A group's colour key and icon, whatever the row carries (v1 rows have neither — P7). */
export function groupLook(g: Pick<Group, "color" | "colorKey" | "icon">): GroupLook {
  return {
    colorKey: isGroupColorKey(g.colorKey) ? g.colorKey : colorKeyFromArgb(g.color),
    icon: isGroupIconKey(g.icon) ? g.icon : DEFAULT_GROUP_ICON,
  };
}

/** The group with its look filled in — what tools return. */
export function withLook(g: Group): Group & GroupLook {
  return { ...g, ...groupLook(g) };
}

/** The next colour round the palette after `prev` (UX §5); none before → amber. */
export function nextColorKey(prev: GroupColorKey | null): GroupColorKey {
  if (prev == null) return FIRST_GROUP_COLOR;
  return GROUP_COLOR_KEYS[(GROUP_COLOR_KEYS.indexOf(prev) + 1) % GROUP_COLOR_KEYS.length];
}
