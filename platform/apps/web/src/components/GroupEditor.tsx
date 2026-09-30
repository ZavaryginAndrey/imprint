import { Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n";
import { useStoreApi } from "../store/hooks";
import { GROUP_COLOR_KEYS, GROUP_ICONS } from "../store/look";
import type { GroupRow } from "../store/view";
import styles from "./GroupEditor.module.css";
import { GroupIcon } from "./GroupIcon";
import pop from "./Popover.module.css";
import { useTypingSave } from "./useTypingSave";

/**
 * Group edit (UX §5, mockup `edit-menu.html`): name (saved as you type), icon grid, colours, «Удалить группу».
 * Picks never close the window. Delete does: the group goes at once, its tasks stay without a group, and the
 * toast's «Отменить» brings both back (`restore_group`).
 */
export function GroupEditor({ group, onClose }: { group: GroupRow; onClose(): void }) {
  const t = useT();
  const store = useStoreApi();
  const [name, setName] = useState(group.name);
  const saver = useTypingSave((v) => {
    if (v.trim() !== "") store.run("rename_group", { groupId: group.id, name: v });
  });

  const remove = () => {
    saver.flush();
    store.run("delete_group", { groupId: group.id });
    store.toast({ text: "groupDeleted", action: { name: "restore_group", input: { groupId: group.id } } });
    onClose();
  };

  return (
    <div className={styles.ed}>
      <div className={pop.h}>{t.groupName}</div>
      <input
        className={pop.name}
        autoFocus
        value={name}
        aria-label={t.groupName}
        maxLength={80}
        onChange={(e) => {
          setName(e.target.value);
          saver.type(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          saver.flush();
          onClose();
        }}
      />
      <div className={pop.h}>{t.icon}</div>
      <div className={styles.icons}>
        {GROUP_ICONS.map((k) => (
          <button key={k} type="button" className={styles.icon} aria-label={t.iconNames[k]} aria-pressed={group.icon === k} onClick={() => store.run("set_group_icon", { groupId: group.id, icon: k })}>
            <GroupIcon icon={k} colorKey={null} size={17} />
          </button>
        ))}
      </div>
      <div className={pop.h}>{t.color}</div>
      <div className={styles.colors}>
        {GROUP_COLOR_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.swatch}
            style={{ background: `var(--g-${k})` }}
            aria-label={t.colors[k]}
            aria-pressed={group.colorKey === k}
            onClick={() => store.run("set_group_color", { groupId: group.id, colorKey: k })}
          />
        ))}
      </div>
      <div className={pop.foot}>
        <button type="button" className={styles.del} onClick={remove}>
          <Trash size={14} aria-hidden />
          {t.deleteGroup}
        </button>
        <span>
          <kbd className={pop.kbd}>Esc</kbd> {t.close}
        </span>
      </div>
    </div>
  );
}
