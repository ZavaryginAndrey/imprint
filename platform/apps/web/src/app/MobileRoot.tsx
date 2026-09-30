import { useEffect, useRef, useState } from "react";
import { MobileShell } from "../components/MobileShell";
import { Sidebar } from "../components/Sidebar";
import { MetaStub } from "../screens/MetaStub";
import { MobileList } from "../screens/MobileList";
import { goMobile, mobileScreen, plantDay } from "./mobileNav";
import { backlogPath, routePath, usePath, type Route } from "./router";

/** The mobile app: ☰ + drawer, one screen at a time, Back → the Day (UX §2). */
export function MobileRoot({ route }: { route: Route }) {
  const path = usePath();
  const [drawer, setDrawer] = useState(false);
  const screen = mobileScreen(route, path);

  // On every mount (the layout may have been desktop in between), once per mount: a ref survives StrictMode's
  // simulated remount, so the Day is not planted twice.
  const planted = useRef(false);
  useEffect(() => {
    if (planted.current) return;
    planted.current = true;
    plantDay();
  }, []);

  const go = (to: string) => {
    setDrawer(false);
    goMobile(to);
  };
  const sidebar = (
    <Sidebar
      route={route}
      go={(r) => go(r.screen === "day" ? "/" : routePath(r))}
      mobile={{ backlog: screen === "backlog", onFilter: (f) => go(backlogPath(f)) }}
    />
  );

  return (
    <MobileShell sidebar={sidebar} drawer={drawer} onDrawer={setDrawer}>
      {screen === "day" || screen === "backlog" ? (
        <MobileList list={screen} filter={route.screen === "day" ? route.filter : "all"} />
      ) : (
        <MetaStub screen={screen} />
      )}
    </MobileShell>
  );
}
