import { createContext, useState, type MouseEvent, type ReactNode } from "react";

export const OpenRowContext = createContext<{ open: string | null; setOpen(id: string | null): void }>({ open: null, setOpen: () => {} });

/**
 * One open row at a time (UX §4); a tap outside every row closes it — but not a tap in a window or on its scrim,
 * nor on something a redraw already detached from the page (landing trap: the root then took it for «outside»).
 */
export function OpenRowArea({ className, children }: { className?: string; children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element;
    if (!target.isConnected || target.closest("[data-row], [data-overlay]")) return;
    setOpen(null);
  };
  return (
    <OpenRowContext.Provider value={{ open, setOpen }}>
      <div className={className} onClick={onClick}>
        {children}
      </div>
    </OpenRowContext.Provider>
  );
}
