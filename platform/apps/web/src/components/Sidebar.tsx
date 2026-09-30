import { ChartBar, GearSix, Plus, SignOut, Sun, Tray } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import type { Route } from "../app/router";
import { useT } from "../i18n";
import { useStore, useStoreApi, useView } from "../store/hooks";
import { GroupIcon } from "./GroupIcon";
import { NewGroupField } from "./NewGroupField";
import styles from "./Sidebar.module.css";

type Go = (r: Route) => void;

/**
 * UX §2: two independent choices — the screen (amber bar) and the backlog filter (lit text). A group
 * clicked from History or Settings returns to the Day with that filter.
 */
export function Sidebar({ route, go }: { route: Route; go: Go }) {
  const t = useT();
  const view = useView();
  const online = useStore((s) => s.online);
  const store = useStoreApi();
  const [adding, setAdding] = useState(false);
  const filter = route.screen === "day" ? route.filter : null;

  return (
    <div className={styles.sb}>
      <div className={styles.logo}>Imprint</div>
      <Item icon={<Sun size={17} />} label={t.day} count={view?.dayOpen} current={route.screen === "day"} onClick={() => go({ screen: "day", filter: filter ?? "all" })} />
      <Item icon={<ChartBar size={17} />} label={t.history} current={route.screen === "history"} onClick={() => go({ screen: "history" })} />
      <Item icon={<GearSix size={17} />} label={t.settings} current={route.screen === "settings"} onClick={() => go({ screen: "settings" })} />
      <hr className={styles.hr} />
      <div className={styles.lab}>{t.backlog}</div>
      <div className={styles.filters}>
        <Item icon={<Tray size={17} />} label={t.allTasks} count={view?.backlogOpen} pressed={filter === "all"} onClick={() => go({ screen: "day", filter: "all" })} />
        {view?.groups.map((g) => (
          <Item
            key={g.id}
            icon={<GroupIcon icon={g.icon} colorKey={g.colorKey} size={17} onSide />}
            label={g.name}
            count={g.openCount}
            pressed={filter === g.id}
            onClick={() => go({ screen: "day", filter: g.id })}
          />
        ))}
        {adding ? (
          <NewGroupField className={styles.field} placeholder={t.newGroup} onClose={() => setAdding(false)} />
        ) : (
          <button type="button" className={`${styles.it} ${styles.add}`} onClick={() => setAdding(true)}>
            <Plus size={17} aria-hidden />
            <span className={styles.lb}>{t.addGroup}</span>
          </button>
        )}
      </div>
      <div className={styles.foot}>
        {!online && <span className={styles.offline}>{t.offline}</span>}
        <button type="button" className={styles.out} onClick={() => void store.logout()}>
          <SignOut size={15} aria-hidden />
          {t.signOut}
        </button>
      </div>
    </div>
  );
}

function Item({ icon, label, count, current, pressed, onClick }: {
  icon: ReactNode;
  label: string;
  count?: number;
  current?: boolean;
  pressed?: boolean;
  onClick(): void;
}) {
  const cls = [styles.it, current ? styles.sel : "", pressed ? styles.flt : ""].join(" ");
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
    >
      <span className={styles.ic} aria-hidden>
        {icon}
      </span>
      <span className={styles.lb}>{label}</span>
      {count !== undefined && count > 0 && <span className={styles.n}>{count}</span>}
    </button>
  );
}
