import { expect, test, type Page } from "@playwright/test";
import { saved, signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
});

test("task title by right click: saved as you type, Enter closes, a reload keeps it", async ({ page }) => {
  await tool(page, "capture_task", { title: "Молоко", view: "day" });
  await page.reload();
  await day(page).getByText("Молоко").click({ button: "right", position: { x: 10, y: 8 } });
  const field = page.getByRole("textbox", { name: "Название задачи" });
  await field.fill("Кефир");
  await expect(day(page).getByText("Кефир")).toBeVisible();
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(day(page).getByText("Кефир")).toBeVisible();
});

test("task title by the keyboard: Shift+F10 on the circle opens it, Enter saves, a reload keeps it", async ({ page }) => {
  await tool(page, "capture_task", { title: "Хлеб", view: "day" });
  await page.reload();
  await day(page).getByRole("button", { name: "Отметить: Хлеб" }).focus();
  await page.keyboard.press("Shift+F10");
  const field = page.getByRole("textbox", { name: "Название задачи" });
  await expect(page.getByRole("dialog", { name: "Название задачи" })).toBeVisible();
  await field.fill("Батон");
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(day(page).getByText("Батон")).toBeVisible();
  await expect(day(page).getByText("Хлеб")).toHaveCount(0);
});

test("group edit by right click: icon, colour and name; picks keep the window open", async ({ page }) => {
  await tool(page, "create_group", { name: "Дом" });
  await page.reload();
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: /Дом/ }).click({ button: "right" });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Работа" }).click();
  await dialog.getByRole("button", { name: "Синий" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Название" }).fill("Офис");
  await page.keyboard.press("Escape");
  await expect(nav.getByRole("button", { name: /Офис/ })).toBeVisible();
  await saved(page);
  await page.reload();
  await nav.getByRole("button", { name: /Офис/ }).click({ button: "right" });
  await expect(page.getByRole("dialog").getByRole("button", { name: "Работа" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Синий" })).toHaveAttribute("aria-pressed", "true");
});

test("delete a group: its task stays without a group; «Отменить» brings both back", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await tool(page, "capture_task", { title: "Полка", view: { group: g.id } });
  await page.reload();
  const nav = page.getByRole("navigation");
  await nav.getByRole("button", { name: /Дом/ }).click({ button: "right" });
  await page.getByRole("button", { name: /Удалить группу/ }).click();
  await expect(nav.getByRole("button", { name: /Дом/ })).toHaveCount(0);
  await expect(backlog(page).getByRole("group", { name: "Без группы" }).getByText("Полка")).toBeVisible();
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(backlog(page).getByRole("group", { name: "Дом" }).getByText("Полка")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(backlog(page).getByRole("group", { name: "Дом" }).getByText("Полка")).toBeVisible();
});

test("deleting the group being filtered falls back to «Все задачи»", async ({ page }) => {
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await page.goto(`/g/${g.id}`);
  await page.getByRole("navigation").getByRole("button", { name: /Дом/ }).click({ button: "right" });
  await page.getByRole("button", { name: /Удалить группу/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Все задачи").first()).toBeVisible();
});
