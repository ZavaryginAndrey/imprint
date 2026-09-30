import styles from "./ScreenTitle.module.css";

/** ScreenTitle + ScreenTitleAccent (03-DESIGN §4): Playfair Black, the amber italic line under it. */
export function ScreenTitle({ title, accent }: { title: string; accent: string }) {
  return (
    <header className={styles.head}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.accent}>{accent}</p>
    </header>
  );
}
