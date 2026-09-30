import { useEffect, useRef } from "react";
import { useStore } from "../store/hooks";
import { remember, rememberedFilter, type Route } from "./router";

type Go = (r: Route, opts?: { replace?: boolean }) => void;

/**
 * Keep the address honest once the server's state is in (not on a stale cache): a group filter that no
 * longer exists falls back to «Все задачи»; `/` opens with the last filter this browser used (UX §2) — unless
 * `restore` is off: on mobile `/` is always the Day.
 */
export function useRouteGuards(route: Route, go: Go, { restore = true }: { restore?: boolean } = {}): void {
  const synced = useStore((s) => s.synced);
  const groups = useStore((s) => s.view?.groups ?? null);
  const restored = useRef(false);

  useEffect(() => {
    if (!synced || !groups || route.screen !== "day") return;
    const exists = (id: string) => groups.some((g) => g.id === id);
    if (!restored.current) {
      restored.current = true;
      if (restore) {
        const last = rememberedFilter();
        if (route.filter === "all" && last !== "all" && exists(last)) return go({ screen: "day", filter: last }, { replace: true });
      }
    }
    if (route.filter !== "all" && !exists(route.filter)) return go({ screen: "day", filter: "all" }, { replace: true });
    // However the filter was reached — a click, an address, Back — it is the one to reopen with.
    remember(route.filter);
  }, [synced, groups, route, go, restore]);
}
