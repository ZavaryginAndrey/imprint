import { useState } from "react";
import type { GroupRow, Row } from "../store/view";
import { RowActions } from "./RowActions";
import { TaskRow } from "./TaskRow";

/** A desktop row with its hover actions; while one of their popovers is open the row stays lit. */
export function RowWithActions({ row, where, group }: { row: Row; where: "day" | "backlog"; group?: GroupRow }) {
  const [active, setActive] = useState(false);
  return <TaskRow row={row} where={where} group={group} active={active} actions={<RowActions row={row} group={group} onOpenChange={setActive} />} />;
}
