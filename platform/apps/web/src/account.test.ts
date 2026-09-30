import { describe, expect, it } from "vitest";
import { addProbeTask, fetchMe, fetchSnapshot, liveUrl, parseLive } from "./account";

const respond = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const down = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};

describe("fetchMe", () => {
  it("reads the signed-in user", async () => {
    expect(await fetchMe(respond(200, { sub: "g-1", email: "me@example.test" }))).toEqual({ kind: "in", sub: "g-1", email: "me@example.test" });
    expect(await fetchMe(respond(200, { sub: "g-1", email: null }))).toEqual({ kind: "in", sub: "g-1", email: null });
  });

  it("401 is signed out; 500, garbage or a network error is down — never a throw", async () => {
    expect(await fetchMe(respond(401, { error: "unauthorized" }))).toEqual({ kind: "out" });
    expect(await fetchMe(respond(500, {}))).toEqual({ kind: "down" });
    expect(await fetchMe(respond(200, "<html>"))).toEqual({ kind: "down" });
    expect(await fetchMe(down)).toEqual({ kind: "down" });
  });
});

describe("state and tools", () => {
  it("fetchSnapshot counts live tasks and reads rev", async () => {
    const body = { tasks: [{ deletedAt: null }, { deletedAt: 5 }, { deletedAt: null }], rev: 7 };
    expect(await fetchSnapshot(respond(200, body))).toEqual({ tasks: 2, rev: 7 });
    expect(await fetchSnapshot(respond(401, {}))).toBeNull();
    expect(await fetchSnapshot(down)).toBeNull();
  });

  it("addProbeTask posts add_task with the tab's conn id and returns the new rev", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const rev = await addProbeTask("tab-1", async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ result: { ok: true, changed: true }, rev: 3 }));
    });
    expect(rev).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/tools/add_task");
    expect(new Headers(calls[0].init?.headers).get("x-imprint-conn")).toBe("tab-1");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ where: "backlog" });
    expect(await addProbeTask("tab-1", respond(401, {}))).toBeNull();
  });
});

describe("live channel", () => {
  it("liveUrl follows the page's scheme", () => {
    expect(liveUrl({ protocol: "https:", host: "imprint.test" }, "a")).toBe("wss://imprint.test/api/live?conn=a");
    expect(liveUrl({ protocol: "http:", host: "localhost:5173" }, "a")).toBe("ws://localhost:5173/api/live?conn=a");
  });

  it("parseLive reads { changed, rev } and nothing else", () => {
    expect(parseLive('{"changed":true,"rev":4}')).toBe(4);
    expect(parseLive("pong")).toBeNull();
    expect(parseLive('{"rev":4}')).toBeNull();
    expect(parseLive(42)).toBeNull();
  });
});
