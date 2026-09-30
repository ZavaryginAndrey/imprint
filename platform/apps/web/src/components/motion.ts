import autoAnimate from "@formkit/auto-animate";
import { useEffect, useRef } from "react";

let enabled = true;

/** Tests turn list motion off: a DOM emulation cancels the animations it starts on teardown. */
export function setListMotion(on: boolean): void {
  enabled = on;
}

/**
 * FLIP for a list (UX §6: motion reports an action): a done row slides down, a new one fades in, a removed
 * one collapses. auto-animate respects `prefers-reduced-motion`.
 */
export function useListMotion<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof el.animate !== "function") return;
    const controller = autoAnimate(el, { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    return () => controller.disable();
  }, []);
  return ref;
}
