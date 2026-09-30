import { expect, test, type Page } from "@playwright/test";
import { signIn, tool } from "./session";

/** UX §1, §8: no page scroll, every sidebar item and the input visible, only lists scroll. */
async function expectNoPageScroll(page: Page) {
  const { sh, ih, sw, iw } = await page.evaluate(() => ({
    sh: document.scrollingElement!.scrollHeight,
    ih: innerHeight,
    sw: document.scrollingElement!.scrollWidth,
    iw: innerWidth,
  }));
  expect(sh).toBeLessThanOrEqual(ih);
  expect(sw).toBeLessThanOrEqual(iw);
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
]) {
  test(`${size.width}×${size.height}: no page scroll, a long list scrolls inside its column`, async ({ context, page }) => {
    await signIn(context);
    await page.setViewportSize(size);
    await page.goto("/");
    for (let i = 1; i <= 30; i++) await tool(page, "capture_task", { title: `Задача ${i}`, view: "day" });
    await page.reload();
    await expect(page.getByText("Задача 30")).toBeAttached();

    await expectNoPageScroll(page);
    const nav = page.getByRole("navigation");
    for (const name of ["День", "История", "Настройки", "Все задачи", "Группа", "Выйти"]) {
      await expect(nav.getByRole("button", { name: new RegExp(name) }).first()).toBeInViewport();
    }
    await expect(page.getByRole("textbox", { name: "Что не забыть?" })).toBeInViewport();

    const list = page.getByRole("region", { name: "День" });
    const { scrollH, clientH } = await list.evaluate((el) => ({ scrollH: el.scrollHeight, clientH: el.clientHeight }));
    expect(scrollH).toBeGreaterThan(clientH);
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByText("Задача 30")).toBeInViewport();
    await expectNoPageScroll(page);
  });
}

test("a popover opened near the right and bottom edges stays in view", async ({ context, page }) => {
  await signIn(context);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  for (let i = 1; i <= 25; i++) await tool(page, "capture_task", { title: `Потом ${i}`, view: "backlog" });
  await page.reload();
  const list = page.getByRole("region", { name: "Бэклог" });
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const row = list.locator("[data-row]", { hasText: "Потом 25" });
  await row.hover();
  await row.getByRole("button", { name: "Выбрать группу" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
  expect(box.y + box.height).toBeLessThanOrEqual(768);
});
