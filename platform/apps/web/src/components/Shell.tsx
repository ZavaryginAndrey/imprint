import type { ReactNode } from "react";
import styles from "./Shell.module.css";

/** The centred block (UX §1): `clamp(960px, 62vw, 1200px)`, the world's background on either side. */
export function Shell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <div className={styles.shell}>
        <nav className={styles.sidebar}>{sidebar}</nav>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
