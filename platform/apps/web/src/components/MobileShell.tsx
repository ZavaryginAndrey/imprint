import { List } from "@phosphor-icons/react";
import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import styles from "./MobileShell.module.css";
import sheet from "./Sheet.module.css";

/**
 * Mobile (UX §1–§2): ☰ at the top, one screen under it; the sidebar slides in as a drawer over a scrim (a tap on
 * the scrim, Esc or a choice closes it). No edge swipe — it fights the system Back on iOS (plan decision 4). As
 * with `Sheet`, the scrim closes on its click, not its pointerdown — else the click lands on the row under it.
 */
export function MobileShell({ sidebar, drawer, onDrawer, children }: {
  sidebar: ReactNode;
  drawer: boolean;
  onDrawer(open: boolean): void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className={styles.phone}>
      <D.Root open={drawer} onOpenChange={onDrawer}>
        <header className={styles.top}>
          <D.Trigger asChild>
            <button type="button" className={styles.menu} aria-label={t.menu}>
              <List size={22} aria-hidden />
            </button>
          </D.Trigger>
        </header>
        <D.Portal>
          <D.Overlay
            className={sheet.scrim}
            data-overlay
            data-scrim
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDrawer(false);
            }}
          />
          <D.Content
            className={styles.drawer}
            data-overlay
            aria-describedby={undefined}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <D.Title className="visually-hidden">{t.menu}</D.Title>
            <nav className={styles.side}>{sidebar}</nav>
          </D.Content>
        </D.Portal>
      </D.Root>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
