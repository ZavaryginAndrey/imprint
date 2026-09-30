import { expect, type Locator, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

/**
 * Where a drag takes hold of `target`: its middle, but at most 24 px from its left edge. A row's title span fills
 * the row, so its middle may lie under the hover icons (they cover the end of the row) — a press there is a
 * press on an icon, and no drag.
 */
export async function grabPoint(target: Locator): Promise<{ x: number; y: number }> {
  const a = (await target.boundingBox())!;
  return { x: a.x + Math.min(a.width / 2, 24), y: a.y + a.height / 2 };
}

/** A real pointer drag: press, move past dnd-kit's 6 px, travel, drop. */
export async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = await grabPoint(from);
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 12, a.y + 4, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
  await page.mouse.up();
}

/** A long touch (UX §4): pointerdown, 650 ms, pointerup — what the row's long-tap timer listens for. */
export async function longPress(target: Locator): Promise<void> {
  const box = (await target.boundingBox())!;
  const init = { pointerType: "touch", isPrimary: true, bubbles: true, clientX: box.x + 10, clientY: box.y + box.height / 2 };
  await target.dispatchEvent("pointerdown", init);
  await target.page().waitForTimeout(650);
  await target.dispatchEvent("pointerup", init);
}

export interface ServerTask {
  id: string;
  title: string;
  location: string;
  groupId: string | null;
  dueDate: number | null;
  deletedAt: number | null;
  parentId: string | null;
  updatedAt: number;
}
export interface ServerGroup {
  id: string;
  name: string;
  position: number;
  deletedAt: number | null;
  icon?: string;
  colorKey?: string | null;
}

export async function serverState(page: Page): Promise<{ tasks: ServerTask[]; groups: ServerGroup[] }> {
  return (await (await page.request.get("/api/state")).json()) as { tasks: ServerTask[]; groups: ServerGroup[] };
}

export async function expectInside(inner: Locator, outer: Box): Promise<void> {
  const box = (await inner.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(box.y).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
}

export async function expectInViewport(page: Page, target: Locator): Promise<void> {
  const vp = page.viewportSize()!;
  await expectInside(target, { x: 0, y: 0, width: vp.width, height: vp.height });
}
