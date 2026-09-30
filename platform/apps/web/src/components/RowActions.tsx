import { ArrowsClockwise, CalendarBlank, ListChecks, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n";
import { useStoreApi, useView } from "../store/hooks";
import type { GroupRow, Row } from "../store/view";
import { DateButton } from "./DateButton";
import { GroupIcon } from "./GroupIcon";
import { GroupPicker } from "./GroupPicker";
import { Popover } from "./Popover";
import { RepeatPicker } from "./RepeatPicker";
import styles from "./RowActions.module.css";
import { StepsPanel } from "./StepsPanel";

type Open = "group" | "repeat" | "steps" | null;

/**
 * A row's actions (UX §4), in order: group label, date, repeat, steps, delete. The domain decides what each does
 * (a future date takes a Day task to the Backlog); the row only asks. `onOpenChange` keeps the row lit while one
 * of their windows is open.
 */
export function RowActions({ row, group, onOpenChange }: { row: Row; group?: GroupRow; onOpenChange?(open: boolean): void }) {
  const t = useT();
  const view = useView();
  const store = useStoreApi();
  const [open, setOpen] = useState<Open>(null);

  const toggle = (k: Exclude<Open, null>) => (o: boolean) => {
    setOpen(o ? k : null);
    onOpenChange?.(o);
  };

  const remove = () => {
    store.run("delete_task", { taskId: row.id });
    store.toast({ text: "deleted", action: { name: "restore_task", input: { taskId: row.id } } });
  };

  return (
    <>
      <Popover
        open={open === "group"}
        onOpenChange={toggle("group")}
        label={t.pickGroup}
        align="end"
        trigger={
          <button type="button" className={group ? styles.tag : `${styles.tag} ${styles.empty}`} aria-label={t.pickGroup} title={group?.name ?? t.group}>
            {group ? (
              <>
                <GroupIcon icon={group.icon} colorKey={group.colorKey} size={13} />
                <span className={styles.gn}>{group.name}</span>
              </>
            ) : (
              <Plus size={12} aria-hidden />
            )}
          </button>
        }
      >
        <GroupPicker
          value={row.groupId}
          onPick={(groupId) => {
            store.run("set_task_group", { taskId: row.id, groupId });
            toggle("group")(false);
          }}
        />
      </Popover>
      <DateButton
        className={styles.ib}
        value={row.dueKey}
        min={view?.today ?? ""}
        label={t.date}
        onPick={(date) => store.run("set_due_date", { taskId: row.id, date })}
      >
        <CalendarBlank size={17} aria-hidden />
      </DateButton>
      <Popover
        open={open === "repeat"}
        onOpenChange={toggle("repeat")}
        label={t.repeat}
        align="end"
        trigger={
          <button type="button" className={styles.ib} aria-label={t.repeat} title={t.repeat}>
            <ArrowsClockwise size={17} aria-hidden />
          </button>
        }
      >
        <RepeatPicker row={row} />
      </Popover>
      <Popover
        open={open === "steps"}
        onOpenChange={toggle("steps")}
        label={t.steps}
        align="end"
        trigger={
          <button type="button" className={styles.ib} aria-label={t.steps} title={t.steps}>
            <ListChecks size={17} aria-hidden />
          </button>
        }
      >
        <StepsPanel row={row} />
      </Popover>
      <button type="button" className={styles.ib} aria-label={t.delete} title={t.delete} onClick={remove}>
        <Trash size={17} aria-hidden />
      </button>
    </>
  );
}
