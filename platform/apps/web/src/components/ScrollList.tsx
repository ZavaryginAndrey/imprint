import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ScrollList.module.css";

/**
 * A column's list: it scrolls, the page never does (UX §1). Its edges fade over 28 px only towards where
 * there is more to scroll (03-DESIGN `fadingEdges`).
 */
export function ScrollList({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const top = el.scrollTop > 2;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(measure);
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={styles.list} data-top={edges.top} data-bottom={edges.bottom} aria-label={label} role="region">
      {children}
    </div>
  );
}
