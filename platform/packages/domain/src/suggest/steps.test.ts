import { describe, expect, it } from "vitest";
import { MSK, THU, WED, world } from "../day/fixtures";
import { ev, group, task } from "../tools/fixtures";
import { SUGGEST_HISTORY_LIMIT, buildStepsPrompt, parseSteps, prepareSuggestion, stepsContext } from "./steps";

// buildStepsPrompt / parseSteps ported from app/src/test/java/com/imprint/app/domain/CloudSplitPromptTest.kt (7 tests).
describe("buildStepsPrompt — CloudSplitPromptTest parity", () => {
  const ctx = (p: Partial<Parameters<typeof buildStepsPrompt>[0]> = {}) =>
    ({ taskTitle: "Разобрать шкаф", groupName: null, completedInGroup: [], existingSteps: [], ...p });

  it("build_includesTheTaskTitle", () => {
    expect(buildStepsPrompt(ctx())).toContain("Разобрать шкаф");
  });

  it("build_includesGroupAndHistory_whenPresent", () => {
    const p = buildStepsPrompt(ctx({ taskTitle: "Свёрстать экран настроек", groupName: "Разработка приложения", completedInGroup: ["Настроить проект", "Сделать экран дня"] }));
    expect(p).toContain("Разработка приложения");
    expect(p).toContain("Настроить проект");
    expect(p).toContain("Сделать экран дня");
  });

  it("build_omitsGroupAndHistorySections_whenAbsent", () => {
    const p = buildStepsPrompt(ctx({ taskTitle: "Полить цветы" }));
    expect(p).not.toContain("проекту");
    expect(p).not.toContain("уже сделано");
  });

  it("build_ignoresBlankGroupAndBlankHistoryItems", () => {
    const p = buildStepsPrompt(ctx({ taskTitle: "T", groupName: "   ", completedInGroup: ["", "  "] }));
    expect(p).not.toContain("проекту");
    expect(p).not.toContain("уже сделано");
  });

  it("parseSteps_splitsLines_dropsBlanks_trims", () => {
    expect(parseSteps("  Достать вещи \n\n Протереть полки  \n")).toEqual(["Достать вещи", "Протереть полки"]);
  });

  it("parseSteps_stripsBulletsAndNumbering", () => {
    const reply = "1. Достать вещи\n2) Протереть полки\n- Разложить обратно\n* Отдать лишнее\n• Выбросить хлам";
    expect(parseSteps(reply)).toEqual(["Достать вещи", "Протереть полки", "Разложить обратно", "Отдать лишнее", "Выбросить хлам"]);
  });

  it("parseSteps_emptyReply_isEmptyList", () => {
    expect(parseSteps("   \n  \n")).toEqual([]);
  });

  it("(2.0) lists the steps the task already has and asks only for the missing ones", () => {
    const p = buildStepsPrompt(ctx({ existingSteps: ["Достать вещи"] }));
    expect(p).toContain("Уже есть шаги");
    expect(p).toContain("Достать вещи");
    expect(buildStepsPrompt(ctx())).not.toContain("Уже есть шаги");
  });
});

describe("stepsContext — ChecklistRepository.cloudContext parity", () => {
  it("group name, done titles in the group newest first without repeats or the task itself, existing steps", () => {
    const t = task({ id: "t", title: "Свёрстать экран", groupId: "g" });
    const state = world(
      [t, task({ id: "s1", title: "Макет", parentId: "t", position: 1 }), task({ id: "s0", title: "Эскиз", parentId: "t", position: 0 }), task({ id: "sx", title: "Удалён", parentId: "t", deletedAt: 1 })],
      [
        ev({ id: "a", taskId: "x", title: "Настроить проект", groupId: "g", at: 1 }),
        ev({ id: "b", taskId: "y", title: "Сделать экран дня", groupId: "g", at: 3 }),
        ev({ id: "c", taskId: "x", title: "Настроить проект", groupId: "g", at: 5 }),
        ev({ id: "d", taskId: "t", title: "Свёрстать экран", groupId: "g", at: 6 }),
        ev({ id: "e", taskId: "z", title: "Чужое", groupId: "other", at: 7 }),
        ev({ id: "f", taskId: "w", title: "Не сделано", groupId: "g", type: "UNDONE", at: 8 }),
      ],
      [group({ id: "g", name: "Разработка приложения" })],
    );
    expect(stepsContext(state, t)).toEqual({
      taskTitle: "Свёрстать экран",
      groupName: "Разработка приложения",
      completedInGroup: ["Настроить проект", "Сделать экран дня"],
      existingSteps: ["Эскиз", "Макет"],
    });
  });

  it("keeps at most SUGGEST_HISTORY_LIMIT titles; no group means no history", () => {
    const events = Array.from({ length: 20 }, (_, n) => ev({ id: `e${n}`, taskId: `x${n}`, title: `done ${n}`, groupId: "g", at: n }));
    const grouped = task({ id: "t", groupId: "g" });
    expect(stepsContext(world([grouped], events, [group({ id: "g" })]), grouped).completedInGroup).toHaveLength(SUGGEST_HISTORY_LIMIT);
    const loose = task({ id: "t" });
    expect(stepsContext(world([loose], events), loose)).toMatchObject({ groupName: null, completedInGroup: [] });
  });
});

describe("prepareSuggestion", () => {
  const state = world(
    [task({ id: "p", title: "Переезд", location: "DAY" }), task({ id: "s", parentId: "p" }), task({ id: "done", location: "DAY" }), task({ id: "gone", deletedAt: 1 })],
    [ev({ id: "d", taskId: "done", dayKey: WED })],
  );

  it("a prompt for a live top-level task", () => {
    const r = prepareSuggestion(state, "p", THU, MSK);
    expect(r.ok && r.prompt).toContain("Переезд");
  });

  it("refusals as tool results: not_found, is_step, completed", () => {
    expect(prepareSuggestion(state, "gone", THU, MSK)).toEqual({ ok: false, result: { ok: false, error: "not_found" } });
    expect(prepareSuggestion(state, "nope", THU, MSK)).toEqual({ ok: false, result: { ok: false, error: "not_found" } });
    expect(prepareSuggestion(state, "s", THU, MSK)).toEqual({ ok: false, result: { ok: true, changed: false, reason: "is_step" } });
    expect(prepareSuggestion(state, "done", THU, MSK)).toEqual({ ok: false, result: { ok: true, changed: false, reason: "completed" } });
  });
});
