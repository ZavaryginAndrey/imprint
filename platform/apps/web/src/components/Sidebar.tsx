import { ChartBar, GearSix, Plus, SignOut, Sun, Tray } from "@phosphor-icons/react";
import { useState } from "react";
import type { Route } from "../app/router";
import { useT } from "../i18n";
import { useStore, useStoreApi, useView } from "../store/hooks";
import { GroupFilters } from "./GroupFilters";
import { NavItem } from "./NavItem";
import { NewGroupField } from "./NewGroupField";
import styles from "./Sidebar.module.css";

type Go = (r: Route) => void;

/**
 * UX §2: two independent choices — the screen (amber bar) and the backlog filter (lit text). A group
 * clicked from History or Settings returns to the Day with that filter.
 */
export function Sidebar({ route, go, mobile }: {
  route: Route;
  go: Go;
  /** Mobile (UX §2): the Day and each filter are separate screens; filters open a Backlog screen. */
  mobile?: { backlog: boolean; onFilter(filter: string): void };
}) {
  const t = useT();
  const view = useView();
  const online = useStore((s) => s.online);
  const store = useStoreApi();
  const [adding, setAdding] = useState(false);
  const onDay = route.screen === "day" && !mobile?.backlog;
  const filter = route.screen !== "day" ? null : mobile ? (mobile.backlog ? route.filter : null) : route.filter;
  const pick = (f: string) => (mobile ? mobile.onFilter(f) : go({ screen: "day", filter: f }));

  return (
    <div className={styles.sb}>
      <div className={styles.logo}>Imprint</div>
      <NavItem icon={<Sun size={17} />} label={t.day} count={view?.dayOpen} current={onDay} onClick={() => go({ screen: "day", filter: mobile ? "all" : (filter ?? "all") })} />
      <NavItem icon={<ChartBar size={17} />} label={t.history} current={route.screen === "history"} onClick={() => go({ screen: "history" })} />
      <NavItem icon={<GearSix size={17} />} label={t.settings} current={route.screen === "settings"} onClick={() => go({ screen: "settings" })} />
      <hr className={styles.hr} />
      <div className={styles.lab}>{t.backlog}</div>
      <div className={styles.filters}>
        <NavItem icon={<Tray size={17} />} label={t.allTasks} count={view?.backlogOpen} pressed={filter === "all"} onClick={() => pick("all")} />
        <GroupFilters filter={filter} onPick={pick} />
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
