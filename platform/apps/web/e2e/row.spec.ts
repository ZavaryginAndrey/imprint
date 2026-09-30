import { expect, test, type Page } from "@playwright/test";
import { dateIn, saved, signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
  await tool(page, "capture_task", { title: "Молоко", view: "day" });
  await page.reload();
  await expect(day(page).getByText("Молоко")).toBeVisible();
});

test("tick and untick by the circle; the mark survives a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Отметить: Молоко" }).click();
  await expect(page.getByRole("button", { name: "Вернуть: Молоко" })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Вернуть: Молоко" })).toBeVisible();
  await page.getByRole("button", { name: "Вернуть: Молоко" }).click();
  await expect(page.getByRole("button", { name: "Отметить: Молоко" })).toBeVisible();
});

test("a future date from the row's calendar takes the task to the Backlog", async ({ page }) => {
  const row = day(page).locator("[data-row]", { hasText: "Молоко" });
  await row.hover();
  await row.getByLabel("Дата").fill(dateIn(3));
  await expect(backlog(page).getByText("Молоко")).toBeVisible();
  await expect(day(page).getByText("Молоко")).toHaveCount(0);
});

test("delete at once, «Отменить» brings it back", async ({ page }) => {
  const row = day(page).locator("[data-row]", { hasText: "Молоко" });
  await row.hover();
  await row.getByRole("button", { name: "Удалить" }).click();
  await expect(day(page).getByText("Молоко")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Задача удалена");
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(day(page).getByText("Молоко")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(day(page).getByText("Молоко")).toBeVisible();
});

test("hovering a row does not move its text (UX §4)", async ({ page }) => {
  const title = day(page).getByText("Молоко");
  // Let the list's entrance motion finish before measuring.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const before = await title.boundingBox();
  await day(page).locator("[data-row]", { hasText: "Молоко" }).hover();
  const after = await title.boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(after?.y).toBe(before?.y);
});
