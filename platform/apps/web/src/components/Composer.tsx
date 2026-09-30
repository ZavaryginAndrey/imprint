import { CalendarBlank, Plus, Tag } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../i18n";
import { useStoreApi, useView } from "../store/hooks";
import { DateButton } from "./DateButton";
import styles from "./Composer.module.css";
import { GroupIcon } from "./GroupIcon";
import { GroupPicker } from "./GroupPicker";
import { Popover } from "./Popover";

type Quick = "tomorrow" | "weekend" | "week";
const QUICK: Quick[] = ["tomorrow", "weekend", "week"];

/**
 * The input field (UX §3): «Что не забыть?» with chips Завтра · Выходные · +7 дней · calendar · group.
 * Where the task lands is the domain's `capture_task` rule; the field only passes the filter, the chip
 * group and the date. Enter adds and keeps focus; N focuses from anywhere; Esc leaves.
 */
export function Composer({ filter, backlogAll = false }: {
  filter: string;
  /** Mobile «Все задачи» Backlog screen (UX §3): without a date the task goes to the Backlog, without a group. */
  backlogAll?: boolean;
}) {
  const t = useT();
  const view = useView();
  const store = useStoreApi();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  /** A quick chip is kept as its kind and turned into a date on Enter — today may have changed since. */
  const [date, setDate] = useState<{ quick: Quick } | { key: string } | null>(null);
  /** undefined: the chip is untouched (the filter decides); null: «Без группы». */
  const [groupId, setGroupId] = useState<string | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const chosen = typeof groupId === "string" ? view?.groups.find((g) => g.id === groupId) : undefined;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const add = () => {
    if (title.trim() === "") return;
    const key = date === null ? null : "key" in date ? date.key : (view?.quick[date.quick] ?? null);
    const r = store.run("capture_task", {
      title,
      view: backlogAll ? "backlog" : filter === "all" ? "day" : { group: filter },
      ...(groupId !== undefined ? { groupId } : {}),
      ...(key ? { date: key } : {}),
    });
    if (r.ok && r.task) store.highlight((r.task as { id: string }).id);
    setTitle("");
    setDate(null);
    setGroupId(undefined);
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Escape") {
      input.current?.blur();
    }
  };

  const quick = date !== null && "quick" in date ? date.quick : null;
  const custom = date !== null && "key" in date ? date.key : null;
  const toggleQuick = (q: Quick) => setDate(quick === q ? null : { quick: q });

  return (
    <div className={styles.qa}>
      <div className={styles.chips}>
        {QUICK.map((q) => (
          <button key={q} type="button" className={styles.chip} aria-pressed={quick === q} onClick={() => toggleQuick(q)}>
            {t[q]}
          </button>
        ))}
        <DateButton
          className={`${styles.chip} ${custom ? styles.on : ""}`}
          value={custom}
          min={view?.today ?? ""}
          label={t.pickDate}
          onPick={(key) => setDate(key ? { key } : null)}
        >
          <CalendarBlank size={14} aria-hidden />
          {custom && <span>{t.dateLabel(custom)}</span>}
        </DateButton>
        <Popover
          open={picking}
          onOpenChange={setPicking}
          label={t.pickGroup}
          side="top"
          trigger={
            <button type="button" className={`${styles.chip} ${groupId === undefined ? styles.empty : styles.on}`} aria-label={t.pickGroup}>
              {chosen ? <GroupIcon icon={chosen.icon} colorKey={chosen.colorKey} size={14} /> : <Tag size={14} aria-hidden />}
              {chosen ? <span className={styles.gn}>{chosen.name}</span> : groupId === null ? <span>{t.noGroup}</span> : null}
            </button>
          }
        >
          <GroupPicker
            value={groupId}
            onPick={(g) => {
              setGroupId(g);
              setPicking(false);
              input.current?.focus();
            }}
          />
        </Popover>
      </div>
      <div className={styles.pill}>
        <input
          ref={input}
          value={title}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          autoComplete="off"
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className={styles.kbd} aria-hidden>
          N
        </span>
        <button type="button" className={styles.plus} aria-label={t.add} onClick={add}>
          <Plus size={18} weight="bold" aria-hidden />
        </button>
      </div>
    </div>
  );
}
