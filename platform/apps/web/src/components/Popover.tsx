import * as P from "@radix-ui/react-popover";
import type { ReactNode, SyntheticEvent } from "react";
import { useLayout } from "./layout";
import styles from "./Popover.module.css";
import { Sheet } from "./Sheet";

const stop = (e: SyntheticEvent) => e.stopPropagation();
const nowhere = () => new DOMRect();

/**
 * Every window (UX §4). Desktop: anchored, pressed to the edge and flipped when it does not fit (Radix collision
 * handling) — at its trigger, or, with no trigger, at `anchor` (a right-click point, a sidebar item). Mobile: a
 * sheet from the bottom. Clicks inside stop here — React bubbles portal events to the row, and the landing learned
 * that a redrawn popover then reads as a click outside. Esc, a click outside or an explicit done closes.
 */
export function Popover({ open, onOpenChange, trigger, anchor, label, children, side = "bottom", align = "start", onCloseAutoFocus }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  trigger?: ReactNode;
  anchor?: () => DOMRect;
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Where focus goes on close (`useFocusReturn` for a window with no trigger). */
  onCloseAutoFocus?(e: Event): void;
}) {
  const layout = useLayout();
  if (layout === "mobile") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} trigger={trigger} label={label} onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </Sheet>
    );
  }
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <P.Trigger asChild>{trigger}</P.Trigger> : <P.Anchor virtualRef={{ current: { getBoundingClientRect: anchor ?? nowhere } }} />}
      <P.Portal>
        <P.Content
          className={styles.pop}
          data-overlay
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          avoidCollisions
          aria-label={label}
          onCloseAutoFocus={onCloseAutoFocus}
          onClick={stop}
          onPointerDown={stop}
          onMouseDown={stop}
          onContextMenu={stop}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
