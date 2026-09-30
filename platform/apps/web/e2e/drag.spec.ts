import { expect, test, type Page } from "@playwright/test";
import { drag, grabPoint, serverState } from "./helpers";
import { dateIn, saved, signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });
/** The column that carries the drop outline (`data-drop`) around a list. */
const column = (page: Page, name: "День" | "Бэклог") => page.locator("section[data-drop]", { has: page.getByRole("region", { name }) });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
});

test("Day → Backlog with «Все задачи»: the group stays, the task lands in its group's section", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await tool(page, "capture_task", { title: "Полить цветы", view: "day", groupId: g.id });
  await page.reload();
  await drag(page, day(page).getByText("Полить цветы"), backlog(page));
  await expect(backlog(page).getByRole("group", { name: "Дом" }).getByText("Полить цветы")).toBeVisible();
  await expect(day(page).getByText("Полить цветы")).toHaveCount(0);
  await saved(page);
  expect((await serverState(page)).tasks.find((t) => t.title === "Полить цветы")?.groupId).toBe(g.id);
});

test("Day → Backlog filtered by a group: the task takes that group", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Работа" })).group as { id: string };
  await tool(page, "capture_task", { title: "Отчёт", view: "day" });
  await page.goto(`/g/${g.id}`);
  await drag(page, day(page).getByText("Отчёт"), backlog(page));
  await expect(backlog(page).getByText("Отчёт")).toBeVisible();
  await saved(page);
  expect((await serverState(page)).tasks.find((t) => t.title === "Отчёт")?.groupId).toBe(g.id);
});

test("Backlog → Day: today's, the date gone, the group kept", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await tool(page, "capture_task", { title: "Фильтр для воды", view: { group: g.id }, date: dateIn(5) });
  await page.goto("/");
  await drag(page, backlog(page).getByText("Фильтр для воды"), day(page));
  await expect(day(page).getByText("Фильтр для воды")).toBeVisible();
  await saved(page);
  const t = (await serverState(page)).tasks.find((x) => x.title === "Фильтр для воды")!;
  expect(t.dueDate).toBeNull();
  expect(t.groupId).toBe(g.id);
});

test("while a row is over the other column, that column shows the drop outline; dropping clears it", async ({ page }) => {
  await tool(page, "capture_task", { title: "Тумба", view: "day" });
  await page.reload();
  const from = await grabPoint(day(page).getByText("Тумба"));
  const to = (await backlog(page).boundingBox())!;
  await expect(column(page, "Бэклог")).toHaveAttribute("data-drop", "false");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 4, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
  await expect(column(page, "Бэклог")).toHaveAttribute("data-drop", "true");
  await expect(column(page, "День")).toHaveAttribute("data-drop", "false");
  await page.mouse.up();
  await expect(column(page, "Бэклог")).toHaveAttribute("data-drop", "false");
  await expect(backlog(page).getByText("Тумба")).toBeVisible();
});

test("a drag never starts from the circle: dragging it moves nothing, clicking it ticks", async ({ page }) => {
  await tool(page, "capture_task", { title: "Молоко", view: "day" });
  await page.reload();
  const circle = day(page).getByRole("button", { name: "Отметить: Молоко" });
  const before = (await serverState(page)).tasks.find((x) => x.title === "Молоко")!;
  await drag(page, circle, backlog(page));
  await expect(day(page).getByText("Молоко")).toBeVisible();
  await expect(backlog(page).getByText("Молоко")).toHaveCount(0);
  await saved(page);
  // A move_task would change the column (`location`) and bump `updatedAt`; a Day task has no date or group to lose.
  const t = (await serverState(page)).tasks.find((x) => x.title === "Молоко")!;
  expect(t.location).toBe(before.location);
  expect(t.updatedAt).toBe(before.updatedAt);
  expect(t.dueDate).toBe(before.dueDate);
  expect(t.groupId).toBe(before.groupId);
  await circle.click();
  await expect(day(page).getByRole("button", { name: "Вернуть: Молоко" })).toBeVisible();
});

test("group order by dragging in the sidebar; it survives a reload and orders the sections", async ({ page }) => {
  for (const name of ["Альфа", "Бета", "Гамма"]) await tool(page, "create_group", { name });
  for (const name of ["Альфа", "Бета", "Гамма"]) {
    const g = (await serverState(page)).groups.find((x) => x.name === name)!;
    await tool(page, "capture_task", { title: `Задача ${name}`, view: { group: g.id } });
  }
  await page.reload();
  const nav = page.getByRole("navigation");
  await drag(page, nav.getByRole("button", { name: /Гамма/ }), nav.getByRole("button", { name: /Альфа/ }));
  await saved(page);
  await page.reload();
  await expect(nav.getByRole("button", { name: /Гамма/ })).toBeVisible();
  const names = await nav.getByRole("button", { name: /Альфа|Бета|Гамма/ }).allTextContents();
  expect(names.map((n) => n.replace(/\d+$/, ""))).toEqual(["Гамма", "Альфа", "Бета"]);
  const sections = await backlog(page).getByRole("heading", { level: 3 }).allTextContents();
  expect(sections).toEqual(["Гамма", "Альфа", "Бета"]);
});
