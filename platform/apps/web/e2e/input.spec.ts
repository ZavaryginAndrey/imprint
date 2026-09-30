import { expect, test, type Page } from "@playwright/test";
import { signIn, tool } from "./session";

const day = (page: Page) => page.getByRole("region", { name: "День" });
const backlog = (page: Page) => page.getByRole("region", { name: "Бэклог" });
const field = (page: Page) => page.getByRole("textbox", { name: "Что не забыть?" });

async function add(page: Page, title: string) {
  await field(page).fill(title);
  await field(page).press("Enter");
}

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "День" })).toBeVisible();
});

test.describe("the input table (UX §3, desktop)", () => {
  test("«Все задачи», no date → the Day, no group", async ({ page }) => {
    await add(page, "Молоко");
    await expect(day(page).getByText("Молоко")).toBeVisible();
    await expect(backlog(page).getByText("Молоко")).toHaveCount(0);
  });

  test("«Все задачи» + a date chip → the Backlog, with the date", async ({ page }) => {
    await page.getByRole("button", { name: "Завтра" }).click();
    await add(page, "Отчёт");
    const row = backlog(page).locator("[data-row]", { hasText: "Отчёт" });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/\d+ [а-я]{3}/);
    await expect(day(page).getByText("Отчёт")).toHaveCount(0);
  });

  test("a group filter, no date → that group's Backlog", async ({ page }) => {
    const g = await tool(page, "create_group", { name: "Дом" });
    await page.reload();
    await page.getByRole("button", { name: /^Дом/ }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${(g.group as { id: string }).id}$`));
    await add(page, "Полка");
    await expect(backlog(page).getByText("Полка")).toBeVisible();
    await expect(day(page).getByText("Полка")).toHaveCount(0);
  });

  test("«Все задачи» + the group chip, no date → the Day, in that group", async ({ page }) => {
    await tool(page, "create_group", { name: "Дом" });
    await page.reload();
    await page.getByRole("button", { name: "Выбрать группу" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Дом" }).click();
    await add(page, "Цветы");
    const row = day(page).locator("[data-row]", { hasText: "Цветы" });
    await expect(row).toBeVisible();
    await expect(row.locator("[data-group-icon]")).toHaveAttribute("title", "Дом");
  });

  test("the calendar chip is the browser's own date input; chips reset after adding", async ({ page }) => {
    await expect(page.getByLabel("Выбрать дату")).toHaveAttribute("type", "date");
    const weekend = page.getByRole("button", { name: "Выходные" });
    await weekend.click();
    await expect(weekend).toHaveAttribute("aria-pressed", "true");
    await add(page, "Дача");
    await expect(weekend).toHaveAttribute("aria-pressed", "false");
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue("");
  });

  test("N focuses the field, Esc leaves it", async ({ page }) => {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("n");
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(field(page)).not.toBeFocused();
  });
});
