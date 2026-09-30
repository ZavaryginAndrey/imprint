import { useT } from "../i18n";
import styles from "./MetaStub.module.css";
import { ScreenTitle } from "./ScreenTitle";

/** History and Settings are placeholders until W6 (UX §1), already in the Meta world. */
export function MetaStub({ screen }: { screen: "history" | "settings" }) {
  const t = useT();
  return (
    <section className={styles.view}>
      <ScreenTitle title={t[screen]} accent={screen === "history" ? t.historyAccent : t.settingsAccent} />
      <p className={styles.soon}>{t.soon}</p>
    </section>
  );
}
