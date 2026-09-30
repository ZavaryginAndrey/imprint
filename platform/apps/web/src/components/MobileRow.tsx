import { Sun, Tray } from "@phosphor-icons/react";
import { useContext, useState, type MouseEvent } from "react";
import { useT } from "../i18n";
import { useStoreApi } from "../store/hooks";
import type { GroupRow, Row } from "../store/view";
import type { Column } from "./drag";
import { OpenRowContext } from "./OpenRow";
import { Popover } from "./Popover";
import { RowActions } from "./RowActions";
import actions from "./RowActions.module.css";
import { TaskRow } from "./TaskRow";
import { TitleEditor } from "./TitleEditor";
import { usePressMenu } from "./usePressMenu";

/**
 * A phone row (UX §4): a tap opens the tray under the text — move (a tray in the Day, a sun in the Backlog; icon
 * only), group, date, repeat, steps, delete; a long tap opens the title sheet. No swipes. The open row stays lit
 * and never reacts to hover.
 */
export function MobileRow({ row, where, group }: { row: Row; where: Column; group?: GroupRow }) {
  const t = useT();
  const store = useStoreApi();
  const { open, setOpen } = useContext(OpenRowContext);
  const [renaming, setRenaming] = useState(false);
  const press = usePressMenu(() => setRenaming(true));
  const isOpen = open === row.id;
  const toDay = where === "backlog";

  const tap = (e: MouseEvent) => {
    if ((e.target as Element).closest("button, input, a, [data-overlay]")) return;
    setOpen(isOpen ? null : row.id);
  };

  const tray = (
    <div className={actions.tray} data-tray>
      <button
        type="button"
        className={actions.ib}
        aria-label={toDay ? t.toDay : t.toBacklog}
        onClick={() => store.run(toDay ? "move_to_day" : "move_to_backlog", { taskId: row.id })}
      >
        {toDay ? <Sun size={18} aria-hidden /> : <Tray size={18} aria-hidden />}
      </button>
      <RowActions row={row} group={group} tray />
    </div>
  );

  return (
    <>
      <TaskRow row={row} where={where} group={group} open={isOpen} handlers={{ ...press, onClick: tap }} below={isOpen ? tray : undefined} />
      <Popover open={renaming} onOpenChange={setRenaming} label={t.taskTitle}>
        <TitleEditor row={row} onDone={() => setRenaming(false)} />
      </Popover>
    </>
  );
}
