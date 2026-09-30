import { Plus, Tag } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n";
import { useView } from "../store/hooks";
import { GroupIcon } from "./GroupIcon";
import { NewGroupField } from "./NewGroupField";
import pop from "./Popover.module.css";

/**
 * The group list (UX §3, §4): «Без группы», the groups, and «Новая группа» — Enter creates it (domain
 * rules: tag icon, next colour) and picks it at once.
 */
export function GroupPicker({ value, onPick }: { value: string | null | undefined; onPick(groupId: string | null): void }) {
  const t = useT();
  const view = useView();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <button type="button" className={`${pop.opt} ${pop.mute} ${value === null ? pop.on : ""}`} onClick={() => onPick(null)}>
        <Tag size={16} aria-hidden />
        {t.noGroup}
      </button>
      {view?.groups.map((g) => (
        <button key={g.id} type="button" className={`${pop.opt} ${value === g.id ? pop.on : ""}`} onClick={() => onPick(g.id)}>
          <GroupIcon icon={g.icon} colorKey={g.colorKey} size={16} />
          {g.name}
        </button>
      ))}
      <hr className={pop.hr} />
      {adding ? (
        <NewGroupField className={pop.name} placeholder={t.newGroup} onCreated={onPick} onClose={() => setAdding(false)} />
      ) : (
        <button type="button" className={`${pop.opt} ${pop.mute}`} onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden />
          {t.newGroup}
        </button>
      )}
    </div>
  );
}
