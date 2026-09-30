import { useCallback, useSyncExternalStore } from "react";

/**
 * The addresses of UX §2: history and reload never lose the place. `/g/all` on desktop is the Day with «Все задачи»;
 * on mobile it is the whole Backlog (the mobile layout reads the raw path, see `usePath`).
 */
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

/** Mobile (UX §2): any `/g/...` address is the Backlog screen — `/g/all` all of it, `/g/<id>` one group. */
export function isBacklogPath(path: string): boolean {
  return /^\/g\/[^/]+\/?$/.test(path);
}

export function backlogPath(filter: string): string {
  return `/g/${filter === "all" ? "all" : encodeURIComponent(filter)}`;
}

export function navigatePath(path: string, opts: { replace?: boolean } = {}): void {
  if (path === window.location.pathname) return;
  if (opts.replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  if (r.screen === "day") remember(r.filter);
  navigatePath(routePath(r), opts);
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

/** The raw path — the mobile layout tells `/` from `/g/all`, which the Route does not. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath);
}

/** The current route; the setter pushes (or replaces) a history entry. */
export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const path = usePath();
  const go = useCallback((r: Route, opts?: { replace?: boolean }) => navigate(r, opts), []);
  return [parseRoute(path), go];
}
