import { expect, test, type Page } from "@playwright/test";
import { saved, signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
});

test("repeat: day chips keep the window open; the row shows the days; «Не повторять» clears them", async ({ page }) => {
  await tool(page, "capture_task", { title: "Спорт", view: "backlog" });
  await page.reload();
  const row = backlog(page).locator("[data-row]", { hasText: "Спорт" });
  await row.hover();
  await row.getByRole("button", { name: "Повтор" }).click();
  const dialog = page.getByRole("dialog", { name: "Повтор" });
  await dialog.getByRole("button", { name: "пн" }).click();
  await dialog.getByRole("button", { name: "чт" }).click();
  await expect(dialog).toBeVisible();
  await expect(backlog(page).locator("[data-row]", { hasText: "Спорт" })).toContainText("пн чт");
  await dialog.getByRole("button", { name: /Не повторять/ }).click();
  await expect(backlog(page).locator("[data-row]", { hasText: "Спорт" })).not.toContainText("пн");
});

test("steps: the last open step closes the task, unticking reopens it; the window stays open", async ({ page }) => {
  await tool(page, "capture_task", { title: "Покупки", view: "day" });
  await page.reload();
  const row = day(page).locator("[data-row]", { hasText: "Покупки" });
  await row.hover();
  await row.getByRole("button", { name: "Шаги" }).click();
  const dialog = page.getByRole("dialog", { name: "Шаги" });
  for (const s of ["Список", "Магазин"]) {
    await dialog.getByRole("textbox", { name: "Новый шаг" }).first().fill(s);
    await dialog.getByRole("textbox", { name: "Новый шаг" }).first().press("Enter");
  }
  await dialog.getByRole("button", { name: "Отметить: Список" }).click();
  await dialog.getByRole("button", { name: "Отметить: Магазин" }).click();
  await expect(day(page).getByRole("button", { name: "Вернуть: Покупки" })).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Вернуть: Магазин" }).click();
  await expect(day(page).getByRole("button", { name: "Отметить: Покупки" })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(day(page).locator("[data-row]", { hasText: "Покупки" }).getByLabel("Шаги: 1 из 2")).toBeVisible();
});

test("«Подсказать шаги» without a model configured: a quiet note, no toast", async ({ page }) => {
  await tool(page, "capture_task", { title: "Переезд", view: "day" });
  await page.reload();
  const row = day(page).locator("[data-row]", { hasText: "Переезд" });
  await row.hover();
  await row.getByRole("button", { name: "Шаги" }).click();
  await page.getByRole("button", { name: /Подсказать шаги/ }).click();
  await expect(page.getByText("Подсказки сейчас недоступны")).toBeVisible();
  await expect(page.getByText("Не сохранилось")).toHaveCount(0);
});
