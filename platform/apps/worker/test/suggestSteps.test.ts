import { SUGGEST_DAILY_QUOTA } from "@imprint/domain";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { writeMeta } from "../src/store/schema";
import { SqlStore } from "../src/store/sqlStore";
import { SERVER_TOOLS, findServerTool, runServerTool, type ServerDeps } from "../src/tools/index";
import { metaQuota } from "../src/tools/quota";
import { NOON_UTC, newSub, withStorage } from "./helpers";

const suggest = findServerTool("suggest_steps")!;

function deps(storage: DurableObjectStorage, s: SqlStore, generate: ServerDeps["generate"]): ServerDeps {
  return {
    state: () => s.view().state,
    settings: () => s.view().settings,
    today: () => s.view().today,
    quota: metaQuota(storage),
    generate,
  };
}
function addTask(s: SqlStore, title = "Переезд"): string {
  const r = s.execute("add_task", { title, where: "day" }).result;
  if (!r.ok) throw new Error("add_task failed");
  return (r.task as { id: string }).id;
}

describe("suggest_steps", () => {
  it("is registered as a server tool, outside the domain's ALL_TOOLS", () => {
    expect(SERVER_TOOLS.map((t) => t.name)).toEqual(["suggest_steps"]);
  });

  it("returns parsed steps and the remaining allowance; writes no rows and keeps rev", () =>
    withStorage(async (storage) => {
      const s = new SqlStore(storage, { read: () => NOON_UTC });
      const taskId = addTask(s);
      const prompts: string[] = [];
      const r = await runServerTool(deps(storage, s, async (p) => (prompts.push(p), "1. Собрать коробки\n2. Заказать машину")), suggest, { taskId });
      expect(r).toEqual({ ok: true, changed: false, steps: ["Собрать коробки", "Заказать машину"], remaining: SUGGEST_DAILY_QUOTA - 1 });
      expect(prompts[0]).toContain("Переезд");
      expect(s.revision).toBe(1);
      expect(s.snapshot().tasks).toHaveLength(1);
    }));

  it("refusals before any model call: not_found, is_step, invalid_input", () =>
    withStorage(async (storage) => {
      const s = new SqlStore(storage, { read: () => NOON_UTC });
      const taskId = addTask(s);
      const step = s.execute("add_steps", { taskId, steps: ["a"] }).result as unknown as { steps: { id: string }[] };
      let calls = 0;
      const d = deps(storage, s, async () => (calls++, "x"));
      expect(await runServerTool(d, suggest, { taskId: "nope" })).toEqual({ ok: false, error: "not_found" });
      expect(await runServerTool(d, suggest, { taskId: step.steps[0].id })).toEqual({ ok: true, changed: false, reason: "is_step" });
      expect(await runServerTool(d, suggest, { taskId: "" })).toMatchObject({ ok: false, error: "invalid_input" });
      expect(calls).toBe(0);
    }));

  it("no key is unavailable and uses no allowance", () =>
    withStorage(async (storage) => {
      const s = new SqlStore(storage, { read: () => NOON_UTC });
      const taskId = addTask(s);
      expect(await runServerTool(deps(storage, s, null), suggest, { taskId })).toEqual({ ok: false, error: "unavailable" });
      const r = await runServerTool(deps(storage, s, async () => "a"), suggest, { taskId });
      expect(r).toMatchObject({ remaining: SUGGEST_DAILY_QUOTA - 1 });
    }));

  it("a failed model call is upstream and gives the slot back", () =>
    withStorage(async (storage) => {
      const s = new SqlStore(storage, { read: () => NOON_UTC });
      const taskId = addTask(s);
      const boom = await runServerTool(deps(storage, s, async () => { throw new Error("HTTP 500"); }), suggest, { taskId });
      expect(boom).toMatchObject({ ok: false, error: "upstream", message: "HTTP 500" });
      expect(await runServerTool(deps(storage, s, async () => "a"), suggest, { taskId })).toMatchObject({ remaining: SUGGEST_DAILY_QUOTA - 1 });
    }));

  it("after the daily allowance: quota, no model call; the next logical day starts afresh", () =>
    withStorage(async (storage) => {
      let now = NOON_UTC;
      const s = new SqlStore(storage, { read: () => now });
      const taskId = addTask(s);
      let calls = 0;
      const d = deps(storage, s, async () => (calls++, "a"));
      for (let n = 0; n < SUGGEST_DAILY_QUOTA; n++) await runServerTool(d, suggest, { taskId });
      expect(await runServerTool(d, suggest, { taskId })).toEqual({ ok: true, changed: false, reason: "quota", remaining: 0 });
      expect(calls).toBe(SUGGEST_DAILY_QUOTA);
      now += 24 * 3_600_000;
      expect(await runServerTool(d, suggest, { taskId })).toMatchObject({ remaining: SUGGEST_DAILY_QUOTA - 1 });
    }));

  it("the slot is reserved before the model is awaited: a second call on the last slot gets quota at once", () =>
    withStorage(async (storage) => {
      const s = new SqlStore(storage, { read: () => NOON_UTC });
      const taskId = addTask(s);
      writeMeta(storage.sql, `suggest:${s.view().today}`, String(SUGGEST_DAILY_QUOTA - 1));
      let release: (v: string) => void = () => {};
      const first = runServerTool(deps(storage, s, () => new Promise<string>((r) => (release = r))), suggest, { taskId });
      expect(await runServerTool(deps(storage, s, async () => "b"), suggest, { taskId })).toMatchObject({ reason: "quota" });
      release("a");
      expect(await first).toMatchObject({ ok: true, steps: ["a"], remaining: 0 });
    }));
});

describe("suggest_steps through the user's object", () => {
  it("routes by name before the domain tools; without GEMINI_API_KEY it is unavailable and rev is unchanged", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(newSub()));
    const add = await stub.callTool("add_task", { title: "Переезд", where: "day" });
    const taskId = (add.result as unknown as { task: { id: string } }).task.id;
    expect(await stub.callTool("suggest_steps", { taskId })).toEqual({ result: { ok: false, error: "unavailable" }, rev: 1 });
  });
});
