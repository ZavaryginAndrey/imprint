import { SignIn } from "@phosphor-icons/react";
import { useT } from "../i18n";
import styles from "./LoginScreen.module.css";

/** A quiet door (onboarding is out of scope, UX §1): the logo, one line, one button. */
export function LoginScreen({ down, failed }: { down: boolean; failed: boolean }) {
  const t = useT();
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.logo}>Imprint</p>
        <p className={styles.tagline}>{t.tagline}</p>
        {down ? (
          <p className={styles.note}>{t.serverDown}</p>
        ) : (
          <a className={styles.button} href="/auth/login">
            <SignIn size={18} aria-hidden />
            {t.signIn}
          </a>
        )}
        {failed && !down && <p className={styles.note}>{t.signInFailed}</p>}
      </div>
    </main>
  );
}
