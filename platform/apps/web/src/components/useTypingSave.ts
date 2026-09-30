import { useCallback, useEffect, useRef } from "react";

/**
 * Save as you type (UX §4–§5): the last value goes `ms` after typing stops, and at once on `flush` or when the
 * window closes (unmount) — never one call per keystroke (the queue and every other tab would get them all).
 */
export function useTypingSave(save: (value: string) => void, ms = 300): { type(value: string): void; flush(): void } {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = last.current;
    last.current = null;
    if (v !== null) saveRef.current(v);
  }, []);

  useEffect(() => flush, [flush]);

  const type = useCallback(
    (value: string) => {
      last.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    [flush, ms],
  );

  return { type, flush };
}
