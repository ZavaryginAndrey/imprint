import { useState } from "react";
import { useT } from "../i18n";
import type { GroupRow, Row } from "../store/view";
import { Popover } from "./Popover";
import { RowActions } from "./RowActions";
import { TaskRow } from "./TaskRow";
import { TitleEditor } from "./TitleEditor";
import { useFocusReturn } from "./useFocusReturn";
import { usePressMenu } from "./usePressMenu";

/**
 * A desktop row with its hover actions; while one of their windows is open the row stays lit. A right click (or
 * the menu key) opens «Название задачи» at the click; a left click on the text does nothing (UX §4).
 */
export function RowWithActions({ row, where, group }: { row: Row; where: "day" | "backlog"; group?: GroupRow }) {
  const t = useT();
  const [active, setActive] = useState(false);
  const [renameAt, setRenameAt] = useState<DOMRect | null>(null);
  const focus = useFocusReturn();
  const press = usePressMenu((at) => {
    focus.remember();
    setRenameAt(at);
  });

  return (
    <>
      <TaskRow
        row={row}
        where={where}
        group={group}
        active={active || renameAt !== null}
        handlers={press}
        actions={<RowActions row={row} group={group} onOpenChange={setActive} />}
      />
      <Popover open={renameAt !== null} onOpenChange={(o) => !o && setRenameAt(null)} anchor={() => renameAt ?? new DOMRect()} label={t.taskTitle} onCloseAutoFocus={focus.onCloseAutoFocus}>
        <TitleEditor row={row} onDone={() => setRenameAt(null)} />
      </Popover>
    </>
  );
}
