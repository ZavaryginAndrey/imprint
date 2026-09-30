import { BacklogColumn } from "../components/BacklogColumn";
import { Composer } from "../components/Composer";
import { DayColumn } from "../components/DayColumn";
import { useStore } from "../store/hooks";
import styles from "./MobileList.module.css";

/**
 * A mobile screen (UX §2–§3): one column — the Day, or the Backlog (all of it or one group) — and the input under
 * it. The Day adds like «Все задачи»; a group screen into that group; the whole Backlog without a date → the
 * Backlog without a group (the mobile exception).
 */
export function MobileList({ list, filter }: { list: "day" | "backlog"; filter: string }) {
  const ready = useStore((s) => s.view !== null);
  if (!ready) return <section className={styles.view} />;
  return (
    <section className={styles.view}>
      {list === "day" ? <DayColumn /> : <BacklogColumn filter={filter} />}
      <Composer filter={list === "day" ? "all" : filter} backlogAll={list === "backlog" && filter === "all"} />
    </section>
  );
}
