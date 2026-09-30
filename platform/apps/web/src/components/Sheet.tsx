import * as D from "@radix-ui/react-dialog";
import type { ReactNode, SyntheticEvent } from "react";
import styles from "./Sheet.module.css";

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Mobile: every window is a sheet from the bottom over a scrim (UX §4), so it can never leave the screen. Only a
 * click on the scrim closes it — not its pointerdown, whose click would then land on whatever lies under the scrim
 * and collapse the open row (landing trap). Events inside stop here, as in `Popover`.
 */
export function Sheet({ open, onOpenChange, trigger, label, children, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  trigger?: ReactNode;
  label: string;
  children: ReactNode;
  onCloseAutoFocus?(e: Event): void;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay
          className={styles.scrim}
          data-overlay
          data-scrim
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(false);
          }}
        />
        <D.Content
          className={styles.sheet}
          data-overlay
          aria-describedby={undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={onCloseAutoFocus}
          onClick={stop}
          onPointerDown={stop}
          onMouseDown={stop}
          onContextMenu={stop}
        >
          <D.Title className="visually-hidden">{label}</D.Title>
          <div className={styles.grab} aria-hidden />
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
