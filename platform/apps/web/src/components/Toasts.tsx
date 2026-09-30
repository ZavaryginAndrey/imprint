import { X } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { useStore, useStoreApi } from "../store/hooks";
import styles from "./Toasts.module.css";

/** Quiet toasts (UX §4–§5): «Задача удалена · Отменить», «Не сохранилось · Повторить»; 5 s each. */
export function Toasts() {
  const t = useT();
  const store = useStoreApi();
  const toasts = useStore((s) => s.toasts);

  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast}>
          <span>{t[toast.text]}</span>
          {toast.action && (
            <button type="button" className={styles.act} onClick={() => store.act(toast.id)}>
              {toast.text === "notSaved" ? t.retry : t.undo}
            </button>
          )}
          <button type="button" className={styles.close} aria-label="×" onClick={() => store.dismiss(toast.id)}>
            <X size={13} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
