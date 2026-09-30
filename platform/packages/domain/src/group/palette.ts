/**
 * The 2.0 group palette and icon set (05-web-ux §5). A group stores a **key**; each theme picks the tone
 * for its surfaces — the dark (base) tone on dark surfaces, the light-theme tone on light ones. Replaces
 * v1 `GroupColors.kt` in every 2.0 client; the v1 values map to keys in `look.ts`.
 */

export const GROUP_COLOR_KEYS = ["amber", "terracotta", "rose", "plum", "blue", "teal", "sage", "graphite"] as const;
export type GroupColorKey = (typeof GROUP_COLOR_KEYS)[number];

export interface GroupTone {
  name: string;
  /** Base tone — dark surfaces. */
  dark: string;
  /** Darkened tone — light theme. */
  light: string;
}

export const GROUP_COLORS: Readonly<Record<GroupColorKey, GroupTone>> = {
  amber: { name: "Янтарь", dark: "#E0A34A", light: "#A17535" },
  terracotta: { name: "Терракота", dark: "#D9775B", light: "#BB664E" },
  rose: { name: "Роза", dark: "#D17A93", light: "#B2687D" },
  plum: { name: "Слива", dark: "#9C86C9", light: "#8875AF" },
  blue: { name: "Синий", dark: "#6F9BD8", light: "#5B7FB1" },
  teal: { name: "Бирюза", dark: "#5EAFB3", light: "#49888C" },
  sage: { name: "Шалфей", dark: "#7FB59A", light: "#5E8672" },
  graphite: { name: "Графит", dark: "#9AA0AB", light: "#7A7E87" },
};

/** Phosphor icon keys (UX §5); `tag` is the default and what v1 groups get. */
export const GROUP_ICONS = [
  "tag", "house", "briefcase", "heartbeat", "shopping-cart", "book-open", "users", "moon",
  "paw-print", "car", "airplane", "barbell", "plant", "wrench", "graduation-cap", "baby",
] as const;
export type GroupIconKey = (typeof GROUP_ICONS)[number];

export const DEFAULT_GROUP_ICON: GroupIconKey = "tag";
export const FIRST_GROUP_COLOR: GroupColorKey = "amber";

/** Surfaces group colours sit on (03-DESIGN tokens + UX §6 `SideBg`). */
export const DARK_SURFACES = { SideBg: "#232A4B", DarkSurface: "#1C1F27", MetaSurface: "#343D63" } as const;
export const LIGHT_SURFACES = { DaySurface: "#F7F5F1", DayBg: "#E2E6EC" } as const;

export function isGroupColorKey(v: unknown): v is GroupColorKey {
  return typeof v === "string" && (GROUP_COLOR_KEYS as readonly string[]).includes(v);
}

export function isGroupIconKey(v: unknown): v is GroupIconKey {
  return typeof v === "string" && (GROUP_ICONS as readonly string[]).includes(v);
}
