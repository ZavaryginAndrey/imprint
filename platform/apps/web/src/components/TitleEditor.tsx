import { useState } from "react";
import { useT } from "../i18n";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import pop from "./Popover.module.css";
import { useTypingSave } from "./useTypingSave";

/** «Название задачи» (UX §4): saved as you type; Enter or Esc closes. A blank title is not sent. */
export function TitleEditor({ row, onDone }: { row: Row; onDone(): void }) {
  const t = useT();
  const store = useStoreApi();
  const [value, setValue] = useState(row.title);
  const saver = useTypingSave((v) => {
    if (v.trim() !== "") store.run("rename_task", { taskId: row.id, title: v });
  });

  return (
    <div>
      <div className={pop.h}>{t.taskTitle}</div>
      <input
        className={pop.name}
        autoFocus
        value={value}
        aria-label={t.taskTitle}
        maxLength={500}
        onChange={(e) => {
          setValue(e.target.value);
          saver.type(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          saver.flush();
          onDone();
        }}
      />
      <div className={pop.foot}>
        <span>{t.savedAsTyped}</span>
        <span>
          <kbd className={pop.kbd}>Enter</kbd> {t.done}
        </span>
      </div>
    </div>
  );
}
