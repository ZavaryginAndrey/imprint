import { expect, test, type Page } from "@playwright/test";
import { saved, signIn } from "./session";

const sidebar = (page: Page) => page.getByRole("navigation");

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "День" })).toBeVisible();
});

test("«+ Группа» in the sidebar turns into a field; Enter creates the group", async ({ page }) => {
  await sidebar(page).getByRole("button", { name: "Группа" }).click();
  const name = sidebar(page).getByRole("textbox", { name: "Новая группа" });
  await name.fill("Работа");
  await name.press("Enter");
  await expect(sidebar(page).getByRole("button", { name: /^Работа/ })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(sidebar(page).getByRole("button", { name: /^Работа/ })).toBeVisible();
});

test("«Новая группа» from the input chip creates the group and picks it", async ({ page }) => {
  await page.getByRole("button", { name: "Выбрать группу" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Новая группа" }).click();
  const name = dialog.getByRole("textbox", { name: "Новая группа" });
  await name.fill("Дом");
  await name.press("Enter");
  await expect(page.getByRole("button", { name: "Выбрать группу" }).first()).toContainText("Дом");
  const field = page.getByRole("textbox", { name: "Что не забыть?" });
  await field.fill("Полить цветы");
  await field.press("Enter");
  await expect(sidebar(page).getByRole("button", { name: /^Дом/ })).toContainText("1");
});
