import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useStoreApi, useView } from "../store/hooks";
import type { GroupRow } from "../store/view";
import { quietHost, reordered } from "./drag";
import { GroupEditor } from "./GroupEditor";
import { GroupIcon } from "./GroupIcon";
import { useLayout } from "./layout";
import { NavItem } from "./NavItem";
import { Popover } from "./Popover";
import { useFocusReturn } from "./useFocusReturn";
import { usePressMenu } from "./usePressMenu";

/**
 * The sidebar's groups (UX §2, §5): a click filters the backlog; a right click (a long tap on a phone) opens the
 * edit window to the right of the item. The window closes for good when its group is gone — deleted here or in
 * another tab — and does not reopen if «Отменить» brings the group back. On desktop the groups are dragged into
 * a new order (`reorder_groups`); on a phone the long tap is the editor's, so there is no dragging there.
 */
export function GroupFilters({ filter, onPick }: { filter: string | null; onPick(groupId: string): void }) {
  const t = useT();
  const view = useView();
  const store = useStoreApi();
  const layout = useLayout();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [editing, setEditing] = useState<{ id: string; at: DOMRect } | null>(null);
  const focus = useFocusReturn();
  const edit = (id: string, at: DOMRect) => {
    focus.remember();
    setEditing({ id, at });
  };
  const groups = view?.groups ?? [];
  const edited = editing ? groups.find((g) => g.id === editing.id) : undefined;
  const ids = groups.map((g) => g.id);
  const onEnd = (e: DragEndEvent) => {
    const next = reordered(ids, String(e.active.id), e.over ? String(e.over.id) : null);
    if (next) store.run("reorder_groups", { groupIds: next });
  };

  useEffect(() => {
    if (editing && !edited) setEditing(null);
  }, [editing, edited]);

  return (
    <>
      <DndContext sensors={sensors} accessibility={{ container: quietHost() }} onDragEnd={onEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {groups.map((g) => (
            <GroupItem key={g.id} group={g} sortable={layout === "desktop"} pressed={filter === g.id} onPick={onPick} onEdit={(at) => edit(g.id, at)} />
          ))}
        </SortableContext>
      </DndContext>
      <Popover
        open={edited !== undefined}
        onOpenChange={(o) => !o && setEditing(null)}
        anchor={() => editing?.at ?? new DOMRect()}
        label={edited ? edited.name : t.group}
        side="right"
        align="start"
        onCloseAutoFocus={focus.onCloseAutoFocus}
      >
        {edited && <GroupEditor group={edited} onClose={() => setEditing(null)} />}
      </Popover>
    </>
  );
}

/** A group in the sidebar; sortable on desktop. dnd-kit's `attributes` are not spread — they would overwrite the
 * filter's `aria-pressed` — and its pointer-down runs after the menu gesture's. */
function GroupItem({ group, sortable, pressed, onPick, onEdit }: {
  group: GroupRow;
  sortable: boolean;
  pressed: boolean;
  onPick(id: string): void;
  onEdit(at: DOMRect): void;
}) {
  const press = usePressMenu(onEdit, { at: "element" });
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: group.id, disabled: !sortable });
  return (
    <NavItem
      {...press}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}
      onPointerDown={(e) => {
        press.onPointerDown(e);
        listeners?.onPointerDown?.(e);
      }}
      icon={<GroupIcon icon={group.icon} colorKey={group.colorKey} size={17} onSide />}
      label={group.name}
      count={group.openCount}
      pressed={pressed}
      onClick={() => onPick(group.id)}
    />
  );
}
