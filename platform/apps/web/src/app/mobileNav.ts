import { backlogPath, DAY_BELOW, isBacklogPath, isDayBelow, navigate, navigatePath, type Route } from "./router";

export type MobileScreen = "day" | "backlog" | "history" | "settings";

export function mobileScreen(route: Route, path: string): MobileScreen {
  if (route.screen !== "day") return route.screen;
  return isBacklogPath(path) ? "backlog" : "day";
}

export type MobileStep = { kind: "push" | "replace"; path: string } | { kind: "back" };

/**
 * The system Back from the Backlog, History or Settings returns to the Day (UX §2). Invariant: under any other
 * screen's entry lies the Day's. So: from the Day — push; between the others — replace; to the Day — back.
 */
export function mobileStep(from: string, to: string): MobileStep | null {
  if (from === to) return null;
  if (to === "/") return { kind: "back" };
  return from === "/" ? { kind: "push", path: to } : { kind: "replace", path: to };
}

export function goMobile(to: string): void {
  const step = mobileStep(window.location.pathname, to);
  if (!step) return;
  if (step.kind === "back") history.back();
  else navigatePath(step.path, { replace: step.kind === "replace" });
}

/**
 * The route guards' `go` on mobile: a group's Backlog whose group is gone falls back to the whole Backlog
 * (`/g/all`), not to `/` — replacing the entry keeps the Day under it.
 */
export function mobileGuardGo(r: Route, opts?: { replace?: boolean }): void {
  if (r.screen === "day") navigatePath(backlogPath(r.filter), opts);
  else navigate(r, opts);
}

/**
 * The mobile layout starts on another screen — opened straight onto it, or after a desktop period whose pushes left
 * no Day under it: put the Day under it, so Back lands on the Day, not off the app or on another screen. An entry
 * already on the Day (pushed from it, or planted before a reload or an auth flip) is left alone — a second Day
 * under it would make the first Back seem to do nothing.
 */
export function plantDay(): void {
  const path = window.location.pathname;
  if (path === "/" || isDayBelow()) return;
  history.replaceState(null, "", "/");
  history.pushState(DAY_BELOW, "", path);
}
