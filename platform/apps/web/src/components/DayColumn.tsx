import { useT } from "../i18n";
import { useView } from "../store/hooks";
import { ScreenTitle } from "../screens/ScreenTitle";
import styles from "./Column.module.css";
import { useDropZone } from "./DragArea";
import { ListRow } from "./ListRow";
import { useListMotion } from "./motion";
import { ScrollList } from "./ScrollList";

/** The Day (UX §2): the domain's order — a group's tasks together, done ones last. */
export function DayColumn() {
  const t = useT();
  const view = useView();
  const list = useListMotion<HTMLDivElement>();
  const drop = useDropZone("day");
  const groups = new Map(view?.groups.map((g) => [g.id, g]));

  return (
    <section ref={drop.ref} className={styles.col} data-drop={drop.lit}>
      <ScreenTitle title={t.day} accent={t.dayAccent} />
      <ScrollList label={t.day}>
        <div ref={list}>
          {view?.day.map((row) => (
            <ListRow key={row.id} row={row} where="day" group={row.groupId ? groups.get(row.groupId) : undefined} />
          ))}
        </div>
      </ScrollList>
    </section>
  );
}
