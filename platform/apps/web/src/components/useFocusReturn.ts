import { useRef } from "react";

/**
 * A window opened with no trigger (a right click, the menu key, a long tap) gives focus back to where it was when it
 * opened: Radix returns it only to a trigger, else to <body>. `remember` runs in the handler that opens the window —
 * by the time Radix looks, the window's own autofocus has moved focus into it. An element gone meanwhile (its group
 * deleted) is skipped and Radix's fallback stands.
 */
export function useFocusReturn() {
  const back = useRef<HTMLElement | null>(null);
  return {
    remember() {
      const el = document.activeElement;
      back.current = el instanceof HTMLElement && el !== document.body ? el : null;
    },
    onCloseAutoFocus(e: Event) {
      const el = back.current;
      back.current = null;
      if (!el?.isConnected) return;
      e.preventDefault();
      el.focus();
    },
  };
}
