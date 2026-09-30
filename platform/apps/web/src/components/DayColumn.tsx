import { useT } from "../i18n";
import { useView } from "../store/hooks";
import { ScreenTitle } from "../screens/ScreenTitle";
import styles from "./Column.module.css";
import { useListMotion } from "./motion";
import { RowWithActions } from "./RowWithActions";
import { ScrollList } from "./ScrollList";

/** The Day (UX §2): the domain's order — a group's tasks together, done ones last. */
export function DayColumn() {
  const t = useT();
  const view = useView();
  const list = useListMotion<HTMLDivElement>();
  const groups = new Map(view?.groups.map((g) => [g.id, g]));

  return (
    <section className={styles.col}>
      <ScreenTitle title={t.day} accent={t.dayAccent} />
      <ScrollList label={t.day}>
        <div ref={list}>
          {view?.day.map((row) => (
            <RowWithActions key={row.id} row={row} where="day" group={row.groupId ? groups.get(row.groupId) : undefined} />
          ))}
        </div>
      </ScrollList>
    </section>
  );
}
