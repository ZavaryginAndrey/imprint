import { useState, type KeyboardEvent } from "react";
import { useStoreApi } from "../store/hooks";

/**
 * «Новая группа» as a field in place (UX §5): Enter creates the group — the domain picks its icon and the
 * next colour — and hands its id back; Esc, or leaving it empty, closes.
 */
export function NewGroupField({ placeholder, className, onCreated, onClose }: {
  placeholder: string;
  className?: string;
  onCreated?(groupId: string): void;
  onClose(): void;
}) {
  const store = useStoreApi();
  const [name, setName] = useState("");

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (name.trim() === "") return onClose();
    const r = store.run("create_group", { name });
    const group = r.ok ? (r.group as { id: string } | undefined) : undefined;
    setName("");
    if (group) onCreated?.(group.id);
    onClose();
  };

  return (
    <input
      className={className}
      autoFocus
      value={name}
      placeholder={placeholder}
      aria-label={placeholder}
      maxLength={80}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => name.trim() === "" && onClose()}
    />
  );
}
