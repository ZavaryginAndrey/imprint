import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { newSub, openLive, postTool, sessionCookie } from "./helpers";

// W3 review tail for W4: other tabs must learn about a settings change (their «today» may move).
describe("set_user_settings over the socket", () => {
  it("a settings change is pushed to the user's other tabs; a same-value call is not", async () => {
    const sub = newSub();
    const cookie = await sessionCookie(sub);
    const tab = await openLive(env.USER_STORE.get(env.USER_STORE.idFromName(sub)), "tab-b");
    const set = async (input: unknown) =>
      (await (await postTool("set_user_settings", cookie, input)).json()) as { result: { changed: boolean }; rev: number };

    const first = await set({ timezone: "Asia/Tokyo", resetHour: 5 });
    expect(first.result.changed).toBe(true);
    expect(await tab.next()).toEqual({ changed: true, rev: first.rev });

    expect((await set({ timezone: "Asia/Tokyo" })).result.changed).toBe(false);
    const third = await set({ language: "en" });
    expect(await tab.next()).toEqual({ changed: true, rev: third.rev }); // not the same-value call's
  });
});
