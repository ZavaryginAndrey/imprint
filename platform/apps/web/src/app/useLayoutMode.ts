import { useSyncExternalStore } from "react";
import { DESKTOP_QUERY, type Layout } from "../components/layout";

const query = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DESKTOP_QUERY) : null);

function subscribe(fn: () => void): () => void {
  const mq = query();
  mq?.addEventListener("change", fn);
  return () => mq?.removeEventListener("change", fn);
}

const current = (): Layout => (query()?.matches === false ? "mobile" : "desktop");

/** The layout the window's width asks for; it follows resizes and rotations. */
export function useLayoutMode(): Layout {
  return useSyncExternalStore(subscribe, current);
}
