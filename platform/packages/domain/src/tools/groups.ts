import { z } from "zod";
import { argbOf, groupLook, nextColorKey, withLook } from "../group/look";
import { compareGroups } from "../group/order";
import { DEFAULT_GROUP_ICON, GROUP_COLOR_KEYS, GROUP_ICONS, type GroupColorKey, type GroupIconKey } from "../group/palette";
import { liveGroups } from "../merge";
import type { Group, Task } from "../types";
import type { ToolContext } from "./context";
import { defineTool, type ToolDef } from "./define";
import { changed, fail, unchanged } from "./result";
import { id, isStep, liveGroup, liveTask, text } from "./support";

/** Group tools — UX §5 over the v1 group row (colour as a key, `color` derived; ADR 010). */

const colorKey = z.enum(GROUP_COLOR_KEYS);
const iconKey = z.enum(GROUP_ICONS);

/** A fresh group after the last live one, coloured with the next palette key after it (UX §5). */
export function newGroup(
  ctx: ToolContext,
  name: string,
  now: number,
  look: { colorKey?: GroupColorKey | null; icon?: GroupIconKey | null } = {},
): Group {
  const live = liveGroups(ctx.state()).sort(compareGroups);
  const last = live[live.length - 1];
  const key = look.colorKey ?? nextColorKey(last ? groupLook(last).colorKey : null);
  return {
    id: ctx.newId(),
    name,
    position: last ? last.position + 1 : 0,
    isCollapsed: false,
    color: argbOf(key),
    colorKey: key,
    icon: look.icon ?? DEFAULT_GROUP_ICON,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** The one path every group write goes through: both look fields are written so `color` never drifts from the key (ADR 010). */
function relook(group: Group, patch: Partial<{ colorKey: GroupColorKey; icon: GroupIconKey }>, now: number): Group {
  const look = { ...groupLook(group), ...patch };
  return { ...group, colorKey: look.colorKey, icon: look.icon, color: argbOf(look.colorKey), updatedAt: now };
}

export const createGroup = defineTool({
  name: "create_group",
  description:
    "Create a group after the last one. colorKey (amber, terracotta, rose, plum, blue, teal, sage, graphite) defaults to the " +
    "next colour after the last group's; icon (Phosphor key) defaults to tag.",
  input: z.object({ name: text, colorKey: colorKey.nullish(), icon: iconKey.nullish() }),
  run(ctx, i) {
    const group = newGroup(ctx, i.name, ctx.now(), { colorKey: i.colorKey, icon: i.icon });
    ctx.upsertGroup(group);
    return changed({ group: withLook(group) });
  },
});

export const renameGroup = defineTool({
  name: "rename_group",
  description: "Rename a group. The name is trimmed; a blank name is refused.",
  input: z.object({ groupId: id, name: text }),
  run(ctx, i) {
    const group = liveGroup(ctx, i.groupId);
    if (!group) return fail("not_found");
    if (group.name === i.name) return unchanged("same_value");
    const next = relook({ ...group, name: i.name }, {}, ctx.now());
    ctx.upsertGroup(next);
    return changed({ group: withLook(next) });
  },
});

export const setGroupColor = defineTool({
  name: "set_group_color",
  description: "Change a group's colour to a palette key (amber, terracotta, rose, plum, blue, teal, sage, graphite).",
  input: z.object({ groupId: id, colorKey }),
  run(ctx, i) {
    const group = liveGroup(ctx, i.groupId);
    if (!group) return fail("not_found");
    if (groupLook(group).colorKey === i.colorKey) return unchanged("same_value");
    const next = relook(group, { colorKey: i.colorKey }, ctx.now());
    ctx.upsertGroup(next);
    return changed({ group: withLook(next) });
  },
});

export const setGroupIcon = defineTool({
  name: "set_group_icon",
  description: "Change a group's icon (a Phosphor key such as tag, house, briefcase, heartbeat, shopping-cart, book-open).",
  input: z.object({ groupId: id, icon: iconKey }),
  run(ctx, i) {
    const group = liveGroup(ctx, i.groupId);
    if (!group) return fail("not_found");
    if (groupLook(group).icon === i.icon) return unchanged("same_value");
    const next = relook(group, { icon: i.icon }, ctx.now());
    ctx.upsertGroup(next);
    return changed({ group: withLook(next) });
  },
});

export const deleteGroup = defineTool({
  name: "delete_group",
  description:
    "Delete a group at once. Its tasks are kept and left without a group (returned as detached); restore_group undoes both.",
  input: z.object({ groupId: id }),
  run(ctx, i) {
    const group = liveGroup(ctx, i.groupId);
    if (!group) return fail("not_found");
    const now = ctx.now();
    const gone = relook({ ...group, deletedAt: now }, {}, now);
    ctx.upsertGroup(gone);
    const detached = ctx.state().tasks.filter((t) => t.deletedAt == null && t.groupId === group.id);
    // updatedAt = the group's deletedAt: restore_group recognises exactly these rows, with no stored state (ADR 010).
    for (const t of detached) ctx.upsertTask({ ...t, groupId: null, updatedAt: now });
    return changed({ group: withLook(gone), detached: detached.map((t) => t.id) });
  },
});

export const restoreGroup = defineTool({
  name: "restore_group",
  description:
    "Undo delete_group: the group comes back, and so do its tasks — those the deletion left without a group and nobody has changed since.",
  input: z.object({ groupId: id }),
  run(ctx, i) {
    const group = ctx.state().groups.find((g) => g.id === i.groupId);
    if (!group) return fail("not_found");
    if (group.deletedAt == null) return unchanged("same_value");
    const deletedAt = group.deletedAt;
    const now = ctx.now();
    const back = relook({ ...group, deletedAt: null }, {}, now);
    ctx.upsertGroup(back);
    const reattached = ctx.state().tasks.filter((t) => t.deletedAt == null && t.groupId == null && t.updatedAt === deletedAt);
    for (const t of reattached) ctx.upsertTask({ ...t, groupId: group.id, updatedAt: now });
    return changed({ group: withLook(back), reattached: reattached.map((t) => t.id) });
  },
});

export const reorderGroups = defineTool({
  name: "reorder_groups",
  description: "Set the order of groups (the Backlog's sections and the sidebar): groupIds lists every live group exactly once.",
  input: z.object({ groupIds: z.array(id) }),
  run(ctx, i) {
    const live = liveGroups(ctx.state()).sort(compareGroups);
    const byId = new Map(live.map((g) => [g.id, g]));
    const ids = i.groupIds;
    if (ids.length !== live.length || new Set(ids).size !== ids.length || !ids.every((x) => byId.has(x))) {
      return fail("invalid_input", { message: "groupIds must list every live group exactly once" });
    }
    if (ids.every((x, pos) => live[pos].id === x)) return unchanged("same_value");
    const now = ctx.now();
    const ordered = ids.map((x, pos) => ({ group: byId.get(x) as Group, pos }));
    let updated = 0;
    const groups = ordered.map(({ group, pos }) => {
      if (group.position === pos) return withLook(group);
      const next = relook({ ...group, position: pos }, {}, now);
      ctx.upsertGroup(next);
      updated++;
      return withLook(next);
    });
    return changed({ groups, updated });
  },
});

export const setTaskGroup = defineTool({
  name: "set_task_group",
  description: "Put a task into a group (groupId) or take it out of any group (groupId=null). Refused for a step (is_step).",
  input: z.object({ taskId: id, groupId: id.nullable() }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    if (isStep(ctx, task)) return unchanged("is_step");
    if (i.groupId != null && !liveGroup(ctx, i.groupId)) return fail("not_found", { message: `group ${i.groupId}` });
    if (task.groupId === i.groupId) return unchanged("same_value");
    const next: Task = { ...task, groupId: i.groupId, updatedAt: ctx.now() };
    ctx.upsertTask(next);
    return changed({ task: next });
  },
});

export const setGroupCollapsed = defineTool({
  name: "set_group_collapsed",
  description: "Collapse or expand one group (groupId) or every group (no groupId). Returns how many groups changed.",
  input: z.object({ groupId: id.nullish(), collapsed: z.boolean() }),
  run(ctx, i) {
    let targets: Group[];
    if (i.groupId != null) {
      const group = liveGroup(ctx, i.groupId);
      if (!group) return fail("not_found");
      targets = [group];
    } else {
      targets = liveGroups(ctx.state());
    }
    const toChange = targets.filter((g) => g.isCollapsed !== i.collapsed);
    if (toChange.length === 0) return unchanged("same_value", { updated: 0 });
    const now = ctx.now();
    for (const g of toChange) ctx.upsertGroup(relook({ ...g, isCollapsed: i.collapsed }, {}, now));
    return changed({ updated: toChange.length });
  },
});

export const GROUP_TOOLS: ToolDef[] = [
  createGroup, renameGroup, setGroupColor, setGroupIcon, deleteGroup, restoreGroup, reorderGroups, setTaskGroup, setGroupCollapsed,
];
