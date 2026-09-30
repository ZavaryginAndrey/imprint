import { BacklogColumn } from "../components/BacklogColumn";
import { Composer } from "../components/Composer";
import { DayColumn } from "../components/DayColumn";
import { useStore } from "../store/hooks";
import styles from "./DayScreen.module.css";

/**
 * Desktop Day screen (UX §2): the Day and the Backlog side by side, the input field under both. Until the
 * first state (or the read cache) is in, the world's background alone — no spinner, and no input that
 * would act on an empty world.
 */
export function DayScreen({ filter }: { filter: string }) {
  const ready = useStore((s) => s.view !== null);
  return (
    <section className={styles.view}>
      {ready && (
        <>
          <div className={styles.cols}>
            <DayColumn />
            <BacklogColumn filter={filter} />
          </div>
          <Composer filter={filter} />
        </>
      )}
    </section>
  );
}
