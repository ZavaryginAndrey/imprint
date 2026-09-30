import { describe, expect, it } from "vitest";
import { httpApi } from "./api";

const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const snap = { tasks: [], groups: [], events: [], settings: {}, rev: 3, epoch: "e1" };

describe("httpApi", () => {
  it("state: ok / 401 / network / malformed", async () => {
    expect(await httpApi(respond(200, snap)).state()).toEqual({ kind: "ok", snapshot: snap });
    expect(await httpApi(respond(401, {})).state()).toEqual({ kind: "unauthorized" });
    const offline = async (): Promise<Response> => {
      throw new TypeError("offline");
    };
    expect(await httpApi(offline).state()).toEqual({ kind: "network" });
    expect(await httpApi(respond(200, { rev: 1 })).state()).toEqual({ kind: "network" });
  });

  it("call sends conn and ids, returns result + rev", async () => {
    let seen: RequestInit | undefined;
    let url = "";
    const api = httpApi(async (u, init) => {
      url = u;
      seen = init;
      return new Response(JSON.stringify({ result: { ok: true, changed: true }, rev: 4 }));
    });
    const out = await api.call("capture_task", { title: "x", view: "day" }, { conn: "c1", ids: ["a", "b"] });
    expect(out).toEqual({ kind: "done", result: { ok: true, changed: true }, rev: 4 });
    expect(url).toBe("/api/tools/capture_task");
    const h = new Headers(seen?.headers);
    expect(h.get("x-imprint-conn")).toBe("c1");
    expect(h.get("x-imprint-ids")).toBe("a,b");
    expect(JSON.parse(String(seen?.body))).toEqual({ title: "x", view: "day" });
  });

  it("call without ids sends no ids header", async () => {
    let seen: RequestInit | undefined;
    await httpApi(async (_u, init) => {
      seen = init;
      return new Response(JSON.stringify({ result: { ok: true, changed: false }, rev: 1 }));
    }).call("rename_task", {}, { conn: "c1", ids: [] });
    expect(new Headers(seen?.headers).has("x-imprint-ids")).toBe(false);
  });

  it("call: 5xx and network → network; 401 → unauthorized; other 4xx → a failed result", async () => {
    expect((await httpApi(respond(503, {})).call("x", {}, { conn: "c", ids: [] })).kind).toBe("network");
    expect((await httpApi(respond(401, {})).call("x", {}, { conn: "c", ids: [] })).kind).toBe("unauthorized");
    expect(await httpApi(respond(413, { error: "too_large" })).call("x", {}, { conn: "c", ids: [] })).toEqual({
      kind: "done",
      result: { ok: false, error: "invalid_input", message: "too_large" },
      rev: -1,
    });
  });
});
