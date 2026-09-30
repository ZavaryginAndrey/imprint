import {
  Airplane, Baby, Barbell, BookOpen, Briefcase, Car, GraduationCap, Heartbeat, House, Moon, PawPrint, Plant,
  ShoppingCart, Tag, Users, Wrench, type Icon,
} from "@phosphor-icons/react";
import type { GroupColorKey, GroupIconKey } from "../store/look";

const ICONS: Record<GroupIconKey, Icon> = {
  tag: Tag,
  house: House,
  briefcase: Briefcase,
  heartbeat: Heartbeat,
  "shopping-cart": ShoppingCart,
  "book-open": BookOpen,
  users: Users,
  moon: Moon,
  "paw-print": PawPrint,
  car: Car,
  airplane: Airplane,
  barbell: Barbell,
  plant: Plant,
  wrench: Wrench,
  "graduation-cap": GraduationCap,
  baby: Baby,
};

/**
 * A group's icon in its colour (UX §5: Phosphor fill). `onSide`: on the sidebar, which is dark in every
 * world, so it takes the base tone. No colour → muted.
 */
export function GroupIcon({ icon, colorKey, size = 16, onSide = false }: { icon: GroupIconKey; colorKey: GroupColorKey | null; size?: number; onSide?: boolean }) {
  const Glyph = ICONS[icon] ?? Tag;
  const color = colorKey ? `var(--g-${colorKey}${onSide ? "-side" : ""})` : "var(--muted)";
  return <Glyph size={size} weight="fill" color={color} aria-hidden style={{ flex: "none" }} />;
}
