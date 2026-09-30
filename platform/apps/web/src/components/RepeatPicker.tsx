import { Prohibit } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { activeDays, toggledDays } from "../store/format";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import pop from "./Popover.module.css";
import styles from "./RepeatPicker.module.css";

/**
 * Repeat (UX §4): Пн–Вс chips and «Не повторять». A chip saves at once and leaves the window open; what repeating
 * means (a backlog definition, its appearances in the Day) is the domain's `set_repeating`.
 */
export function RepeatPicker({ row }: { row: Row }) {
  const t = useT();
  const store = useStoreApi();
  const on = activeDays(row);
  const set = (days: string[] | null) => store.run("set_repeating", { taskId: row.id, days });

  return (
    <div>
      <div className={pop.h}>{t.repeat}</div>
      <div className={styles.days}>
        {t.days.map((name, d) => (
          <button key={name} type="button" className={styles.day} aria-pressed={on.includes(d)} onClick={() => set(toggledDays(row, d))}>
            {name}
          </button>
        ))}
      </div>
      <button type="button" className={`${pop.opt} ${pop.mute} ${on.length === 0 ? pop.on : ""}`} onClick={() => set(null)}>
        <Prohibit size={16} aria-hidden />
        {t.noRepeat}
      </button>
    </div>
  );
}
