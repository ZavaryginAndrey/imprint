import { Sparkle, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { ToolResult } from "@imprint/domain";
import { useT, type Strings } from "../i18n";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import { Checkbox } from "./Checkbox";
import pop from "./Popover.module.css";
import styles from "./StepsPanel.module.css";

/** Why a suggestion did not come, in the window's quiet line. */
function refusal(r: ToolResult, t: Strings): string {
  if (!r.ok && r.error === "unavailable") return t.suggestUnavailable;
  if (r.ok && r.reason === "quota") return t.suggestQuota;
  return t.suggestFailed;
}

/**
 * «Разбить на шаги» (UX §4, the phone's SplitDialog): the task's steps, each ticked by its circle; fields for new
 * ones; «Подсказать шаги» asks the server (`suggest_steps`) and adds its steps as fields to edit; «Разбить» or Enter
 * adds every filled field. Steps and the task are one state — the domain syncs them; ticking never closes the window.
 */
export function StepsPanel({ row }: { row: Row }) {
  const t = useT();
  const store = useStoreApi();
  const [drafts, setDrafts] = useState<string[]>([""]);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  const split = () => {
    const steps = drafts.map((s) => s.trim()).filter((s) => s !== "");
    if (steps.length === 0) return;
    store.run("add_steps", { taskId: row.id, steps });
    setDrafts([""]);
    setNote(null);
    first.current?.focus();
  };

  const suggest = async () => {
    setAsking(true);
    setNote(null);
    const r = await store.ask("suggest_steps", { taskId: row.id });
    setAsking(false);
    const steps = r.ok && Array.isArray(r.steps) ? (r.steps as unknown[]).filter((s): s is string => typeof s === "string") : [];
    if (steps.length > 0) setDrafts((d) => [...d.filter((s) => s.trim() !== ""), ...steps]);
    else setNote(refusal(r, t));
  };

  const edit = (i: number, value: string) => setDrafts((all) => all.map((x, j) => (j === i ? value : x)));

  return (
    <div className={styles.panel}>
      <div className={pop.h}>{t.steps}</div>
      {row.steps.length === 0 && <p className={styles.hint}>{t.splitHint}</p>}
      {row.steps.map((s) => (
        <div key={s.task.id} className={styles.step} data-done={s.done}>
          <Checkbox
            done={s.done}
            label={s.done ? t.markUndone(s.task.title) : t.markDone(s.task.title)}
            onToggle={() => store.run("set_done", { taskId: s.task.id, done: !s.done })}
          />
          <span className={styles.st}>{s.task.title}</span>
        </div>
      ))}
      {drafts.map((d, i) => (
        <div key={i} className={styles.draft}>
          <input
            ref={i === 0 ? first : undefined}
            className={styles.field}
            value={d}
            placeholder={t.newStep}
            aria-label={t.newStep}
            maxLength={500}
            onChange={(e) => edit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              split();
            }}
          />
          {drafts.length > 1 && (
            <button type="button" className={styles.x} aria-label={t.removeDraft} onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}>
              <X size={13} aria-hidden />
            </button>
          )}
        </div>
      ))}
      {note && (
        <p className={styles.note} aria-live="polite">
          {note}
        </p>
      )}
      <div className={pop.foot}>
        <button type="button" className={styles.suggest} disabled={asking} onClick={() => void suggest()}>
          <Sparkle size={15} aria-hidden />
          {t.suggest}
        </button>
        <button type="button" className={styles.split} onClick={split}>
          {t.split}
        </button>
      </div>
    </div>
  );
}
