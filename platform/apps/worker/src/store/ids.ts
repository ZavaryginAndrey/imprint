/** `x-imprint-ids`: the ids a tab's optimistic run handed out (ADR 011). */
export const IDS_HEADER = "x-imprint-ids";
export const MAX_IDS = 128;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The listed UUIDs, or none when the header is absent or anything in it is off — the server then picks its own. */
export function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const ids = raw.split(",").map((s) => s.trim());
  if (ids.length > MAX_IDS || new Set(ids).size !== ids.length || !ids.every((id) => UUID.test(id))) return [];
  return ids;
}
