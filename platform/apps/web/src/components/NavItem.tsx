import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Sidebar.module.css";

/** A sidebar item: the screen (amber bar, `current`) or a backlog filter (lit text, `pressed`), with a counter. */
export function NavItem({ icon, label, count, current, pressed, onClick, ref, className, ...rest }: {
  icon: ReactNode;
  label: string;
  count?: number;
  current?: boolean;
  pressed?: boolean;
  onClick(): void;
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const cls = [styles.it, current ? styles.sel : "", pressed ? styles.flt : "", className ?? ""].join(" ");
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      className={cls}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
    >
      <span className={styles.ic} aria-hidden>
        {icon}
      </span>
      <span className={styles.lb}>{label}</span>
      {count !== undefined && count > 0 && <span className={styles.n}>{count}</span>}
    </button>
  );
}
