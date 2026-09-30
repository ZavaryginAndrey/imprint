import { useCallback, useSyncExternalStore } from "react";

/** The addresses of UX §2: history and reload never lose the place. `/g/all` (mobile) is W4b. */
export type Route = { screen: "day"; filter: "all" | string } | { screen: "history" } | { screen: "settings" };

/** The last backlog filter, per browser (UX §2: not synced). */
export const FILTER_KEY = "imprint.filter";
const NAV_EVENT = "imprint:navigate";

export function parseRoute(path: string): Route {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/history") return { screen: "history" };
  if (p === "/settings") return { screen: "settings" };
  const g = /^\/g\/([^/]+)$/.exec(p);
  const filter = g && g[1] !== "all" ? decode(g[1]) : null;
  return { screen: "day", filter: filter ?? "all" };
}

/** A malformed escape in a typed or pasted address reads as no filter, never as a crash. */
function decode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

export function routePath(r: Route): string {
  if (r.screen === "history") return "/history";
  if (r.screen === "settings") return "/settings";
  return r.filter === "all" ? "/" : `/g/${encodeURIComponent(r.filter)}`;
}

export function rememberedFilter(): string {
  try {
    return localStorage.getItem(FILTER_KEY) ?? "all";
  } catch {
    return "all";
  }
}

export function remember(filter: string): void {
  try {
    localStorage.setItem(FILTER_KEY, filter);
  } catch {
    // private mode: the filter is a convenience
  }
}

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const path = routePath(r);
  if (r.screen === "day") remember(r.filter);
  if (path === window.location.pathname) return;
  if (opts.replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

function subscribe(fn: () => void): () => void {
  window.addEventListener("popstate", fn);
  window.addEventListener(NAV_EVENT, fn);
  return () => {
    window.removeEventListener("popstate", fn);
    window.removeEventListener(NAV_EVENT, fn);
  };
}

const currentPath = () => window.location.pathname;

/** The current route; the setter pushes (or replaces) a history entry. */
export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const path = useSyncExternalStore(subscribe, currentPath);
  const go = useCallback((r: Route, opts?: { replace?: boolean }) => navigate(r, opts), []);
  return [parseRoute(path), go];
}
