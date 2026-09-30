import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useView } from "../store/hooks";
import type { GroupRow } from "../store/view";
import { GroupEditor } from "./GroupEditor";
import { GroupIcon } from "./GroupIcon";
import { NavItem } from "./NavItem";
import { Popover } from "./Popover";
import { usePressMenu } from "./usePressMenu";

/**
 * The sidebar's groups (UX §2, §5): a click filters the backlog; a right click (a long tap on a phone) opens the
 * edit window to the right of the item. The window closes for good when its group is gone — deleted here or in
 * another tab — and does not reopen if «Отменить» brings the group back.
 */
export function GroupFilters({ filter, onPick }: { filter: string | null; onPick(groupId: string): void }) {
  const t = useT();
  const view = useView();
  const [editing, setEditing] = useState<{ id: string; at: DOMRect } | null>(null);
  const groups = view?.groups ?? [];
  const edited = editing ? groups.find((g) => g.id === editing.id) : undefined;

  useEffect(() => {
    if (editing && !edited) setEditing(null);
  }, [editing, edited]);

  return (
    <>
      {groups.map((g) => (
        <GroupItem key={g.id} group={g} pressed={filter === g.id} onPick={onPick} onEdit={(at) => setEditing({ id: g.id, at })} />
      ))}
      <Popover
        open={edited !== undefined}
        onOpenChange={(o) => !o && setEditing(null)}
        anchor={() => editing?.at ?? new DOMRect()}
        label={edited ? edited.name : t.group}
        side="right"
        align="start"
      >
        {edited && <GroupEditor group={edited} onClose={() => setEditing(null)} />}
      </Popover>
    </>
  );
}

function GroupItem({ group, pressed, onPick, onEdit }: { group: GroupRow; pressed: boolean; onPick(id: string): void; onEdit(at: DOMRect): void }) {
  const press = usePressMenu(onEdit, { at: "element" });
  return (
    <NavItem
      {...press}
      icon={<GroupIcon icon={group.icon} colorKey={group.colorKey} size={17} onSide />}
      label={group.name}
      count={group.openCount}
      pressed={pressed}
      onClick={() => onPick(group.id)}
    />
  );
}
