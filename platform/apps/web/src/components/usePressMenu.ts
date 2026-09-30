import { useRef, type MouseEvent, type PointerEvent } from "react";

const LONG_MS = 500;
const SLOP_PX = 8;

/**
 * The «menu» gesture of an item (UX §4–§5): a right click or the keyboard's menu key on desktop, a long tap on a
 * phone. `open` gets the box to anchor at: the pointer (`at: "point"`, default) or the item itself
 * (`"element"`; also when a keyboard gives no point). A long tap swallows the click that follows it, and the
 * `contextmenu` Android fires after a long tap does not open it twice.
 */
export function usePressMenu(open: (at: DOMRect) => void, opts: { at?: "point" | "element"; longMs?: number } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const down = useRef(new Set<number>()); // touches on the screen (`isPrimary` is unreliable in synthetic events)

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  // The click a long tap ends with follows the pointerup at once; nothing later may be swallowed.
  const end = (e: PointerEvent<HTMLElement>) => {
    down.current.delete(e.pointerId);
    cancel();
    if (fired.current) setTimeout(() => (fired.current = false), 0);
  };
  const box = (el: Element, x: number, y: number) =>
    opts.at === "element" || (x === 0 && y === 0) ? el.getBoundingClientRect() : new DOMRect(x, y, 0, 0);

  return {
    onContextMenu(e: MouseEvent<HTMLElement>) {
      e.preventDefault();
      cancel();
      if (fired.current) return;
      open(box(e.currentTarget, e.clientX, e.clientY));
    },
    onPointerDown(e: PointerEvent<HTMLElement>) {
      cancel();
      fired.current = false;
      if (e.pointerType === "mouse") return;
      // A primary pointer means no other is down: forget ids whose pointerup was lost (the touched child was
      // removed mid-press), or a stale id would take the long tap away from this item until it remounts.
      if (e.nativeEvent.isPrimary === true) down.current.clear();
      const other = [...down.current].some((id) => id !== e.pointerId);
      down.current.add(e.pointerId);
      if (other) return; // a second finger (pinch) is no long tap, and cancel() above voided the first
      const el = e.currentTarget;
      const { clientX: x, clientY: y } = e;
      start.current = { x, y };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        open(box(el, x, y));
      }, opts.longMs ?? LONG_MS);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) cancel();
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
