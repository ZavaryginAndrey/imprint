/**
 * Gemini `generateContent` over `fetch` — the worker's port of v1 `HttpGeminiClient`. The key comes from
 * the `GEMINI_API_KEY` secret and travels in a header, not the URL.
 */

/** v1's model, validated on device (`GeminiClient.kt`). Re-check the id in the Gemini docs before the first deploy. */
export const GEMINI_MODEL = "gemini-3.6-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 15_000;

export class UpstreamError extends Error {
  override name = "UpstreamError";
}

function textOf(body: unknown): string | null {
  const text = (body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] } | null)?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text : null;
}

export async function generateWithGemini(
  apiKey: string,
  prompt: string,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<string> {
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  let res: Response;
  try {
    res = await doFetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (e) {
    throw new UpstreamError(e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw new UpstreamError(`Gemini HTTP ${res.status}`);
  const text = textOf(await res.json().catch(() => null));
  if (text == null) throw new UpstreamError("Gemini: no text in the reply");
  return text;
}
