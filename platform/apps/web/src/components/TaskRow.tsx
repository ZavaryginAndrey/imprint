import { ArrowsClockwise, ListChecks } from "@phosphor-icons/react";
import type { HTMLAttributes, ReactNode } from "react";
import { useT } from "../i18n";
import { repeatDays } from "../store/format";
import { useStore, useStoreApi } from "../store/hooks";
import type { GroupRow, Row } from "../store/view";
import { Checkbox } from "./Checkbox";
import { GroupIcon } from "./GroupIcon";
import styles from "./TaskRow.module.css";

/**
 * A task at rest (UX §4): circle, title, meta. In the Day the group shows as its icon only (groups are
 * mixed there) and a routine as ↻; in the Backlog the date, or the repeat days in amber. `actions` are the
 * hover icons (desktop), laid over the end of the row; `active` keeps them up while a popover is open.
 */
export function TaskRow({ row, where, group, actions, active = false, handlers }: {
  row: Row;
  where: "day" | "backlog";
  group?: GroupRow;
  actions?: ReactNode;
  active?: boolean;
  /** Gesture handlers for the whole row: the menu gesture (right click, long tap), the phone's tap. */
  handlers?: HTMLAttributes<HTMLDivElement>;
}) {
  const t = useT();
  const store = useStoreApi();
  const fresh = useStore((s) => s.fresh === row.id);
  const done = row.doneToday;

  return (
    <div className={styles.row} data-row data-id={row.id} data-done={done} data-fresh={fresh} data-active={active} {...handlers}>
      <div className={styles.line}>
        <Checkbox
          done={done}
          label={done ? t.markUndone(row.title) : t.markDone(row.title)}
          onToggle={() => store.run("set_done", { taskId: row.id, done: !done })}
        />
        <span className={styles.t}>{row.title}</span>
        {row.steps.length > 0 && (
          <span className={styles.steps} data-steps aria-label={t.stepsOf(row.stepsDone, row.steps.length)}>
            <ListChecks size={13} aria-hidden />
            {row.stepsDone}/{row.steps.length}
          </span>
        )}
        {where === "day" && group && (
          <span className={styles.meta} data-group-icon title={group.name}>
            <GroupIcon icon={group.icon} colorKey={group.colorKey} size={14} />
          </span>
        )}
        {where === "day" && row.isRepeating && (
          <span className={styles.rep} title={t.repeat}>
            <ArrowsClockwise size={13} aria-hidden />
          </span>
        )}
        {where === "backlog" && row.isRepeating && (
          <span className={styles.rep}>
            <ArrowsClockwise size={13} aria-label={t.repeat} />
            {repeatDays(row.recurrenceMask).map((d) => t.days[d]).join(" ")}
          </span>
        )}
        {where === "backlog" && !row.isRepeating && row.dueKey && <span className={styles.date}>{t.dateLabel(row.dueKey)}</span>}
        {actions && (
          <span className={styles.acts} data-actions>
            {actions}
          </span>
        )}
      </div>
    </div>
  );
}
