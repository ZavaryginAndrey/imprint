import { Check } from "@phosphor-icons/react";
import { useState } from "react";
import styles from "./Checkbox.module.css";

/**
 * The only way to tick (CMP-4): a circle with a ≥ 44 px hit area. Ticking plays the phone's pop — the fill
 * warms to amber, the check appears, a 0.82 squash and a spring back (UX §4); reduced motion: none.
 */
export function Checkbox({ done, label, onToggle }: { done: boolean; label: string; onToggle(): void }) {
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      className={styles.c}
      data-done={done}
      data-pop={pop}
      aria-label={label}
      aria-pressed={done}
      onClick={(e) => {
        e.stopPropagation();
        if (!done) setPop(true);
        onToggle();
      }}
      onAnimationEnd={() => setPop(false)}
    >
      <span className={styles.dot} aria-hidden>
        <Check size={11} weight="bold" className={styles.mark} />
      </span>
    </button>
  );
}
