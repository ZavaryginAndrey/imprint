import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { createContext, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useStoreApi } from "../store/hooks";
import type { Row } from "../store/view";
import styles from "./DragArea.module.css";
import { canStartDrag, dropCall, quietHost, type Column, type DragData } from "./drag";
import { TaskRow } from "./TaskRow";

/** Rows are draggable only inside a DragArea (the desktop Day screen); elsewhere — tests, mobile — they are plain. */
export const DragOn = createContext(false);

/** A left-button press on the row itself (not its circle or icons), and only after 6 px — a click stays a click. */
class RowSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: e }: ReactPointerEvent) => e.isPrimary && e.button === 0 && canStartDrag(e.target as Element),
    },
  ];
}

/**
 * Drag between the Day and the Backlog (UX §4): the target column gets a dashed amber outline, the row's old place
 * turns dashed, a lifted copy follows the pointer. The drop is one `move_task`; the domain decides the rest.
 */
export function DragArea({ filter, children }: { filter: string; children: ReactNode }) {
  const store = useStoreApi();
  const [lifted, setLifted] = useState<DragData | null>(null);
  const sensors = useSensors(useSensor(RowSensor, { activationConstraint: { distance: 6 } }));

  const onStart = (e: DragStartEvent) => setLifted((e.active.data.current as DragData | undefined) ?? null);
  const onEnd = (e: DragEndEvent) => {
    const d = e.active.data.current as DragData | undefined;
    setLifted(null);
    if (!d) return;
    const call = dropCall(d.row.id, d.from, (e.over?.id as Column | undefined) ?? null, filter);
    if (call) store.run(call.name, call.input);
  };

  return (
    <DragOn.Provider value={true}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{ container: quietHost() }}
        onDragStart={onStart}
        onDragEnd={onEnd}
        onDragCancel={() => setLifted(null)}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {lifted && (
            <div className={styles.lifted}>
              <TaskRow row={lifted.row} where={lifted.from} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragOn.Provider>
  );
}

/** A column as a drop target; `lit` while a row from the other column is over it. Inert outside a DragArea. */
export function useDropZone(id: Column): { ref: (el: HTMLElement | null) => void; lit: boolean } {
  const { setNodeRef, isOver, active } = useDroppable({ id });
  const from = (active?.data.current as DragData | undefined)?.from;
  return { ref: setNodeRef, lit: isOver && from !== undefined && from !== id };
}

/** A row that can be picked up; a routine shown in both columns has one id per column. */
export function DraggableRow({ row, where, children }: { row: Row; where: Column; children: ReactNode }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `${where}:${row.id}`, data: { row, from: where } satisfies DragData });
  return (
    <div ref={setNodeRef} {...listeners} className={styles.slot} data-dragging={isDragging}>
      {children}
    </div>
  );
}
