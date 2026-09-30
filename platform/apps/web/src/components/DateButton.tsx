import { useRef, type ReactNode } from "react";
import styles from "./DateButton.module.css";

/**
 * The browser's own calendar (UX §3–§4, landing trap: no home-made presets): a transparent
 * `input[type=date]` over the icon, plus `showPicker()` where the browser allows it. Clearing it = no date.
 */
export function DateButton({ value, min, label, className, children, onPick }: {
  value: string | null;
  min: string;
  label: string;
  className?: string;
  children: ReactNode;
  onPick(key: string | null): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className={`${styles.dp} ${className ?? ""}`} title={label}>
      {children}
      <input
        ref={input}
        type="date"
        className={styles.input}
        aria-label={label}
        min={min}
        value={value ?? ""}
        onClick={(e) => {
          e.stopPropagation();
          try {
            input.current?.showPicker?.();
          } catch {
            // not allowed here (e.g. a cross-origin frame): the native control still opens on click
          }
        }}
        onChange={(e) => onPick(e.target.value || null)}
      />
    </span>
  );
}
