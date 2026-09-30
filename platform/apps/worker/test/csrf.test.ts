import { describe, expect, it } from "vitest";
import { BASE, api, newSub, postTool, sessionCookie } from "./helpers";

const EVIL = { origin: "https://evil.example" };

describe("Origin check on mutating routes (CSRF)", () => {
  it("POST /api/tools/:name from a foreign Origin is refused and changes nothing", async () => {
    const cookie = await sessionCookie(newSub());
    const res = await postTool("add_task", cookie, { title: "sneaky", where: "backlog" }, EVIL);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
    expect(await (await api("/api/state", cookie)).json()).toMatchObject({ tasks: [], rev: 0 });
  });

  it("POST /api/tools/:name from the app's own Origin, or with no Origin, works", async () => {
    const cookie = await sessionCookie(newSub());
    expect((await postTool("list_groups", cookie, {}, { origin: BASE })).status).toBe(200);
    expect((await postTool("list_groups", cookie, {})).status).toBe(200);
  });

  it("DELETE /api/account from a foreign Origin is refused and the data stays", async () => {
    const cookie = await sessionCookie(newSub());
    expect((await postTool("add_task", cookie, { title: "keep me", where: "backlog" })).status).toBe(200);
    const res = await api("/api/account", cookie, { method: "DELETE", headers: EVIL });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
    const state = await (await api("/api/state", cookie)).json<{ tasks: { title: string }[] }>();
    expect(state.tasks.map((t) => t.title)).toEqual(["keep me"]);
  });

  it("POST /auth/logout from a foreign Origin is refused and keeps the cookie", async () => {
    const res = await api("/auth/logout", null, { method: "POST", headers: EVIL });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
    expect((await api("/auth/logout", null, { method: "POST", headers: { origin: BASE } })).status).toBe(200);
  });
});
