import {
  addDays, compareGroups, dayStart, dueKey, liveGroups, openCountByGroup, projectBacklog, projectDay, quickDates, withLook,
  type BacklogItem, type DayKind, type Group, type GroupLook, type QuickDate, type ToolContext, type UserSettings,
} from "@imprint/domain";

export type GroupRow = Group & GroupLook & { openCount: number };
/** A task as a row shows it: `kind` in the Day (null in the Backlog), its date as a calendar key, done steps counted. */
export type Row = BacklogItem & { kind: DayKind | null; dueKey: string | null; stepsDone: number };

export interface View {
  today: string;
  settings: UserSettings;
  day: Row[];
  backlog: { groups: { group: GroupRow; tasks: Row[] }[]; ungrouped: Row[] };
  groups: GroupRow[];
  /** The sidebar's Day counter: open tasks today. */
  dayOpen: number;
  /** «Все задачи»: open tasks in the Backlog. */
  backlogOpen: number;
  /** The input field's date chips. */
  quick: Record<QuickDate, string>;
}

/** Everything the screens show, from the domain's projections — the UI never sorts or filters (P1). */
export function project(ctx: ToolContext): View {
  const state = ctx.state();
  const today = ctx.todayKey();
  const settings = ctx.settings();
  const row = (t: BacklogItem, kind: DayKind | null = null): Row => ({
    ...t,
    kind,
    dueKey: t.dueDate == null ? null : dueKey(t.dueDate, settings),
    stepsDone: t.steps.filter((s) => s.done).length,
  });
  const open = openCountByGroup(state, today, settings);
  const groups: GroupRow[] = liveGroups(state)
    .sort(compareGroups)
    .map((g) => ({ ...withLook(g), openCount: open.get(g.id) ?? 0 }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const day = projectDay(state, today, settings).map((t) => row(t, t.kind));
  const b = projectBacklog(state, today, settings);
  const backlog = {
    groups: b.groups.map((s) => ({
      group: byId.get(s.group.id) ?? { ...withLook(s.group), openCount: 0 },
      tasks: s.tasks.map((t) => row(t)),
    })),
    ungrouped: b.ungrouped.map((t) => row(t)),
  };
  const backlogRows = [...backlog.groups.flatMap((s) => s.tasks), ...backlog.ungrouped];
  return {
    today,
    settings,
    day,
    backlog,
    groups,
    dayOpen: day.filter((t) => !t.doneToday).length,
    backlogOpen: backlogRows.filter((t) => !t.doneToday).length,
    quick: quickDates(today),
  };
}

/** How long until the user's logical day turns over — the store re-projects then (Day rollover, ADR 007). */
export function msUntilNextDay(v: View, now: number): number {
  return Math.max(1000, dayStart(addDays(v.today, 1), v.settings) - now);
}
