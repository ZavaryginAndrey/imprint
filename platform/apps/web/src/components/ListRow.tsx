import { useContext } from "react";
import type { GroupRow, Row } from "../store/view";
import { DraggableRow, DragOn } from "./DragArea";
import type { Column } from "./drag";
import { useLayout } from "./layout";
import { MobileRow } from "./MobileRow";
import { RowWithActions } from "./RowWithActions";

/** A list's row as the layout wants it: desktop — hover actions, draggable inside a DragArea; mobile — the tap tray. */
export function ListRow({ row, where, group }: { row: Row; where: Column; group?: GroupRow }) {
  const layout = useLayout();
  const drag = useContext(DragOn);
  if (layout === "mobile") return <MobileRow row={row} where={where} group={group} />;
  const inner = <RowWithActions row={row} where={where} group={group} />;
  return drag ? (
    <DraggableRow row={row} where={where}>
      {inner}
    </DraggableRow>
  ) : (
    inner
  );
}
