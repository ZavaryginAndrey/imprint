import { describe, expect, it } from "vitest";
import { fetchHealth } from "./health";

const respond = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("fetchHealth", () => {
  it("reads a healthy worker", async () => {
    expect(await fetchHealth(respond(200, { ok: true, tools: 17 }))).toEqual({ ok: true, tools: 17 });
  });

  it("a 500, malformed JSON or a wrong shape is not ok", async () => {
    expect(await fetchHealth(respond(500, { ok: true, tools: 1 }))).toEqual({ ok: false });
    expect(await fetchHealth(respond(200, "<html>"))).toEqual({ ok: false });
    expect(await fetchHealth(respond(200, { ok: "yes" }))).toEqual({ ok: false });
  });

  it("a network error is not ok, not a throw", async () => {
    const down = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await fetchHealth(down)).toEqual({ ok: false });
  });
});
