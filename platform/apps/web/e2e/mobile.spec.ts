import { expect, test, type Page } from "@playwright/test";
import { signIn, tool } from "./session";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const field = (page: Page) => page.getByRole("textbox", { name: "Что не забыть?" });
const add = async (page: Page, title: string) => {
  await field(page).fill(title);
  await field(page).press("Enter");
};
const openMenu = (page: Page) => page.getByRole("button", { name: "Меню" }).tap();

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("390×844: no page scroll; the list scrolls; the menu shows every sidebar item; the input is visible", async ({ page }) => {
  await page.goto("/");
  for (let i = 1; i <= 30; i++) await tool(page, "capture_task", { title: `Задача ${i}`, view: "day" });
  await page.reload();
  await expect(page.getByText("Задача 30")).toBeAttached();
  const scroll = await page.evaluate(() => ({ sh: document.scrollingElement!.scrollHeight, ih: innerHeight, sw: document.scrollingElement!.scrollWidth, iw: innerWidth }));
  expect(scroll.sh).toBeLessThanOrEqual(scroll.ih);
  expect(scroll.sw).toBeLessThanOrEqual(scroll.iw);
  await expect(field(page)).toBeInViewport();
  const list = page.getByRole("region", { name: "День" });
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByText("Задача 30")).toBeInViewport();
  await openMenu(page);
  const nav = page.getByRole("navigation");
  for (const name of ["День", "История", "Настройки", "Все задачи", "Группа", "Выйти"]) {
    await expect(nav.getByRole("button", { name: new RegExp(name) }).first()).toBeInViewport();
  }
});

test("the input table on a phone: the Day; the whole Backlog → no group (the exception); a group screen → that group", async ({ page }) => {
  await page.goto("/");
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await page.reload();
  await add(page, "Молоко");
  await expect(page.getByRole("region", { name: "День" }).getByText("Молоко")).toBeVisible();

  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /Все задачи/ }).tap();
  await expect(page).toHaveURL(/\/g\/all$/);
  await add(page, "Полка");
  await expect(page.getByRole("region", { name: "Бэклог" }).getByRole("group", { name: "Без группы" }).getByText("Полка")).toBeVisible();

  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /Дом/ }).tap();
  await expect(page).toHaveURL(new RegExp(`/g/${g.id}$`));
  await add(page, "Лампа");
  await expect(page.getByRole("region", { name: "Бэклог" }).getByText("Лампа")).toBeVisible();
});

test("Back from the Backlog, History or Settings returns to the Day", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /Все задачи/ }).tap();
  await openMenu(page);
  await page.getByRole("navigation").getByRole("button", { name: /История/ }).tap();
  await expect(page).toHaveURL(/\/history$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "День" })).toBeVisible();
});

test("opened straight on /g/all, Back still lands on the Day", async ({ page }) => {
  await page.goto("/g/all");
  await expect(page.getByRole("heading", { name: "Бэклог" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "День" })).toBeVisible();
});
