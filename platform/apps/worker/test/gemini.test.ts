import { describe, expect, it } from "vitest";
import { GEMINI_MODEL, UpstreamError, generateWithGemini } from "../src/tools/gemini";

const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("generateWithGemini", () => {
  it("posts the prompt with the key in a header and returns the text", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json(reply("1. Шаг"));
    };
    expect(await generateWithGemini("k", "Разбей", { fetch: fake })).toBe("1. Шаг");
    expect(calls[0].url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    expect(new Headers(calls[0].init.headers).get("x-goog-api-key")).toBe("k");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ contents: [{ parts: [{ text: "Разбей" }] }] });
  });

  it("a non-2xx answer, a reply without text and a network error are UpstreamError", async () => {
    await expect(generateWithGemini("k", "p", { fetch: async () => new Response("no", { status: 429 }) })).rejects.toThrow(UpstreamError);
    await expect(generateWithGemini("k", "p", { fetch: async () => Response.json({ candidates: [] }) })).rejects.toThrow(UpstreamError);
    await expect(generateWithGemini("k", "p", { fetch: async () => { throw new TypeError("offline"); } })).rejects.toThrow(UpstreamError);
  });

  it("gives up after the timeout", async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError"))));
    await expect(generateWithGemini("k", "p", { fetch: hanging, timeoutMs: 20 })).rejects.toThrow(UpstreamError);
  });
});
