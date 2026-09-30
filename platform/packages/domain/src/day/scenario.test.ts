import { describe, expect, it } from "vitest";
import { addDays } from "../time/day";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import { ok } from "../tools/fixtures";
import { runTool } from "../tools/index";
import { memoryContext, type MemoryContext } from "../tools/memoryContext";
import type { Group } from "../types";
import type { DayItem } from "./project";

/**
 * 07-USECASES §N «Сквозной прогон — три дня из жизни» as a domain test: one user, a clock that walks
 * Monday → Wednesday, only tools and the projection. Step 16 follows ADR 007 (F5a): the report sent back
 * on Tuesday is already on top on Wednesday.
 */
const MONDAY = "2026-09-28";
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const EVENING = ["зубы", "таблетки", "будильник", "сумка"];

describe.each(["Europe/Moscow", "Etc/GMT+8"])("three days of life in %s", (timezone) => {
  const settings: UserSettings = { timezone, resetHour: 4, resetMinute: 0, language: "ru" };
  let wall = 0;
  const clockAt = (day: number, hh: number, mm = 0) => void (wall = instantOf(addDays(MONDAY, day), hh, mm, timezone));
  const run = (ctx: MemoryContext, name: string, input: unknown) => ok(runTool(ctx, name, input));
  const day = (ctx: MemoryContext) => run(ctx, "list_day", {}).tasks as DayItem[];
  const titles = (ctx: MemoryContext) => day(ctx).map((i) => i.title);
  const idOf = (ctx: MemoryContext, title: string) => {
    const found = ctx.state().tasks.find((t) => t.title === title && t.deletedAt == null);
    if (!found) throw new Error(`no live task «${title}»`);
    return found.id;
  };

  it("Monday → Tuesday → Wednesday", () => {
    clockAt(0, 8);
    const ctx = memoryContext({ clock: () => wall, settings });

    // 2 (A3, E1): the evening routines appear by cadence.
    const evening = (run(ctx, "create_group", { name: "Вечер" }).group as Group).id;
    for (const title of EVENING) run(ctx, "add_task", { title, where: "backlog", groupId: evening, repeatDays: EVERY_DAY });
    expect(titles(ctx)).toEqual(EVENING);

    // 3 (B1, D3): two Day tasks go below, in typing order.
    clockAt(0, 9, 0);
    run(ctx, "add_task", { title: "позвонить в банк", where: "day" });
    clockAt(0, 9, 1);
    run(ctx, "add_task", { title: "забрать посылку", where: "day" });
    expect(titles(ctx)).toEqual([...EVENING, "позвонить в банк", "забрать посылку"]);

    // 4 (C4, C6): «Работа» with a report for tomorrow — in the backlog, not the Day.
    const work = (run(ctx, "create_group", { name: "Работа" }).group as Group).id;
    run(ctx, "add_task", { title: "сделать отчёт", where: "backlog", groupId: work, dueDate: addDays(MONDAY, 1) });
    expect(titles(ctx)).not.toContain("сделать отчёт");

    // 6–7 (H3, D6, D4): the parcel is ticked and sinks; the rest keep their places.
    clockAt(0, 12, 5);
    run(ctx, "set_done", { taskId: idOf(ctx, "забрать посылку"), done: true });
    expect(titles(ctx)).toEqual([...EVENING, "позвонить в банк", "забрать посылку"]);
    expect(day(ctx).at(-1)).toMatchObject({ title: "забрать посылку", doneToday: true });
    // The parcel was already last; what 6–7 claim is that it left the open part (the sink itself is pinned at step 8).
    expect(day(ctx).filter((i) => !i.doneToday).map((i) => i.title)).toEqual([...EVENING, "позвонить в банк"]);

    // 8 (E3): three routines done, one skipped for tonight.
    clockAt(0, 22);
    for (const title of EVENING.slice(0, 3)) run(ctx, "set_done", { taskId: idOf(ctx, title), done: true });
    run(ctx, "move_to_backlog", { taskId: idOf(ctx, "сумка") });
    expect(ctx.state().events.some((e) => e.taskId === idOf(ctx, "сумка") && e.type === "SKIPPED" && e.dayKey === MONDAY)).toBe(true);
    expect(titles(ctx)).toEqual(["позвонить в банк", "зубы", "таблетки", "будильник", "забрать посылку"]);

    // 9–10 (F1, E3, F4, F4b): after the 04:00 reset the parcel is gone, the bank call is on top, the
    // report's date brought it in above the routines, and every routine — the skipped one too — is fresh.
    clockAt(1, 4, 5);
    expect(day(ctx).map((i) => [i.title, i.doneToday])).toEqual([
      ["позвонить в банк", false],
      ["сделать отчёт", false],
      ...EVENING.map((t) => [t, false]),
    ]);

    // 12 (C14, G3): a rename does not rewrite yesterday's journal.
    clockAt(1, 10);
    const report = idOf(ctx, "сделать отчёт");
    run(ctx, "rename_task", { taskId: report, title: "сделать отчёт по Q3" });
    expect(ctx.state().events.find((e) => e.taskId === report && e.type === "CREATED")?.title).toBe("сделать отчёт");

    // 14 (D8): the bank call is done; «в бэклог» on a done task does nothing.
    clockAt(1, 15);
    const bank = idOf(ctx, "позвонить в банк");
    run(ctx, "set_done", { taskId: bank, done: true });
    expect(runTool(ctx, "move_to_backlog", { taskId: bank })).toMatchObject({ changed: false, reason: "done_today" });

    // 13 (D9, F5a): tonight the report goes back to the backlog and leaves the Day.
    clockAt(1, 20);
    run(ctx, "move_to_backlog", { taskId: report });
    expect(titles(ctx)).toEqual([...EVENING, "позвонить в банк"]);

    // 15 (F1): Wednesday — the bank call is finished for good; the report's date brings it back on top.
    clockAt(2, 4, 5);
    expect(titles(ctx)).toEqual(["сделать отчёт по Q3", ...EVENING]);

    // 16 (ADR 007 edit of D10): «в День» on it keeps its place — its date already put it there; now it is a Day row.
    expect(runTool(ctx, "move_to_day", { taskId: report })).toMatchObject({ ok: true, changed: true });
    expect(day(ctx)[0]).toMatchObject({ title: "сделать отчёт по Q3", kind: "row", doneToday: false });

    // 17 (D13, L1): everything ticked — nothing open is left.
    for (const item of day(ctx)) run(ctx, "set_done", { taskId: item.id, done: true });
    expect(day(ctx)).toHaveLength(5);
    expect(day(ctx).every((i) => i.doneToday)).toBe(true);
  });

  it.skip("steps 1, 5, 11 — onboarding and the imprint banner: W4 (UI) and W5 (get_imprint)", () => {});
  it.skip("steps 18–19 — History and export/import: W6 and W7", () => {});
});
