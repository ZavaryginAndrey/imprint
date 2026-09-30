import { expect, test, type Page } from "@playwright/test";
import { expectInViewport } from "./helpers";
import { signIn, tool } from "./session";

test.use({ viewport: { width: 1024, height: 768 } });

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
  for (let i = 1; i <= 25; i++) await tool(page, "capture_task", { title: `Потом ${i}`, view: "backlog" });
  for (let i = 1; i <= 9; i++) await tool(page, "create_group", { name: `Группа ${i}` });
  await page.reload();
});

async function lastBacklogRow(page: Page) {
  const list = page.getByRole("region", { name: "Бэклог" });
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const row = list.locator("[data-row]", { hasText: "Потом 25" });
  await row.hover();
  return row;
}

for (const name of ["Повтор", "Шаги"]) {
  test(`«${name}» at the bottom-right corner stays in view`, async ({ page }) => {
    const row = await lastBacklogRow(page);
    await row.getByRole("button", { name }).click();
    await expectInViewport(page, page.getByRole("dialog", { name }));
  });
}

test("«Название задачи» at a click near the bottom-right corner stays in view", async ({ page }) => {
  const row = await lastBacklogRow(page);
  const box = (await row.boundingBox())!;
  // 6 px in from both edges: the row's 12 px corners are round, the very corner pixel is not the row.
  await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6, { button: "right" });
  await expectInViewport(page, page.getByRole("dialog", { name: "Название задачи" }));
});

test("the group editor of the lowest group stays in view", async ({ page }) => {
  await page.getByRole("navigation").getByRole("button", { name: /Группа 9/ }).click({ button: "right" });
  const dialog = page.getByRole("dialog", { name: "Группа 9" });
  await expect(dialog).toBeVisible();
  await expectInViewport(page, dialog);
});
