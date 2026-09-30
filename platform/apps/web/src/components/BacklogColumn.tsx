import { useT } from "../i18n";
import { useView } from "../store/hooks";
import type { GroupRow, Row } from "../store/view";
import { ScreenTitle } from "../screens/ScreenTitle";
import styles from "./Column.module.css";
import { useDropZone } from "./DragArea";
import { GroupIcon } from "./GroupIcon";
import { ListRow } from "./ListRow";
import { useListMotion } from "./motion";
import { ScrollList } from "./ScrollList";

/**
 * The Backlog (UX §2): with «Все задачи» — sections by group in group order, then «Без группы»; with a
 * group filter — just that group's list. Empty sections are not drawn.
 */
export function BacklogColumn({ filter }: { filter: string }) {
  const t = useT();
  const view = useView();
  const selected = filter === "all" ? null : view?.groups.find((g) => g.id === filter) ?? null;
  const sections = view?.backlog.groups ?? [];
  const drop = useDropZone("backlog");

  return (
    <section ref={drop.ref} className={`${styles.col} ${styles.bk}`} data-drop={drop.lit}>
      <ScreenTitle title={t.backlog} accent={selected?.name ?? t.allTasks} />
      <ScrollList label={t.backlog}>
        {filter === "all" ? (
          <>
            {sections
              .filter((s) => s.tasks.length > 0)
              .map((s) => (
                <Section key={s.group.id} group={s.group} rows={s.tasks} />
              ))}
            {(view?.backlog.ungrouped.length ?? 0) > 0 && <Section group={null} rows={view?.backlog.ungrouped ?? []} label={t.noGroup} />}
          </>
        ) : (
          <Rows rows={sections.find((s) => s.group.id === filter)?.tasks ?? []} group={selected ?? undefined} />
        )}
      </ScrollList>
    </section>
  );
}

function Section({ group, rows, label }: { group: GroupRow | null; rows: Row[]; label?: string }) {
  return (
    <div className={styles.section} role="group" aria-label={group?.name ?? label}>
      <h3 className={styles.lbl}>
        {group && <GroupIcon icon={group.icon} colorKey={group.colorKey} size={14} />}
        {group?.name ?? label}
      </h3>
      <Rows rows={rows} group={group ?? undefined} />
    </div>
  );
}

function Rows({ rows, group }: { rows: Row[]; group?: GroupRow }) {
  const list = useListMotion<HTMLDivElement>();
  return (
    <div ref={list}>
      {rows.map((row) => (
        <ListRow key={row.id} row={row} where="backlog" group={group} />
      ))}
    </div>
  );
}
