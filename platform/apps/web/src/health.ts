export type Health = { ok: true; tools: number } | { ok: false };

/** Ask the worker whether it is up. Never throws: the page shows "сервер недоступен" instead. */
export async function fetchHealth(
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<Health> {
  try {
    const r = await fetchImpl("/health");
    if (!r.ok) return { ok: false };
    const body = (await r.json()) as { ok?: unknown; tools?: unknown };
    return body.ok === true && typeof body.tools === "number" ? { ok: true, tools: body.tools } : { ok: false };
  } catch {
    return { ok: false };
  }
}
