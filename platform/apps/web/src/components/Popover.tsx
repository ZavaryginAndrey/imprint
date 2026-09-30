import * as P from "@radix-ui/react-popover";
import type { ReactNode, SyntheticEvent } from "react";
import styles from "./Popover.module.css";

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Every popover (UX §4): anchored, pressed to the edge and flipped when it does not fit (Radix collision
 * handling). Clicks inside stop here — React bubbles portal events to the row, and the landing learned
 * that a redrawn popover then reads as a click outside. Esc, a click outside or an explicit done closes.
 */
export function Popover({ open, onOpenChange, trigger, label, children, side = "bottom", align = "start" }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          className={styles.pop}
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          avoidCollisions
          aria-label={label}
          onClick={stop}
          onPointerDown={stop}
          onMouseDown={stop}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
