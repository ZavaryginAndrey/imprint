/**
 * The group palette — mirrors `com.imprint.app.ui.theme.GroupColors.palette` **exactly** (packed ARGB).
 * Keep in step with the Kotlin file, like `types.ts` with the entities.
 */
export const GROUP_PALETTE: readonly number[] = [
  0xff6c7ae0, // indigo
  0xff3f9d8f, // teal
  0xffd98a3d, // ochre
  0xffc15b7e, // rose
  0xff7e9a4e, // olive
  0xff9b6bc4, // violet
  0xff4e8fc0, // sky
  0xffc0663f, // terracotta
];

/** JVM `String.hashCode()`: int32, `h = 31*h + utf16unit`. */
export function javaStringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** A group's default colour from an id — the same pick as the phone's `DayViewModel.split`. */
export function colorForId(id: string): number {
  const n = GROUP_PALETTE.length;
  return GROUP_PALETTE[((javaStringHashCode(id) % n) + n) % n];
}
