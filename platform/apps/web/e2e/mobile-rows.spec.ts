import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectInViewport, expectInside, longPress } from "./helpers";
import { signIn, tool } from "./session";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// Rows are found without roles: an open window (a modal) hides the whole page from the accessibility tree, and
// «the tray is still open behind the sheet» must be checked exactly then. Titles are unique on a phone screen.
const row = (page: Page, title: string) => page.locator("[data-row]", { hasText: title });
const tray = (page: Page, title: string) => row(page, title).locator("[data-tray]");

/** A sheet rises for 250 ms: wait for it to stop before measuring it. */
const settled = (sheet: Locator) => sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)).then(() => undefined));

test.beforeEach(async ({ context, page }) => {
  await signIn(context);
  await page.goto("/");
  const g = (await tool(page, "create_group", { name: "Очень длинное название группы" })).group as { id: string };
  await tool(page, "capture_task", { title: "Позвонить в банк про карту и заодно спросить про вклад", view: "day", groupId: g.id });
  await tool(page, "capture_task", { title: "Хлеб", view: "day" });
  await page.reload();
});

for (const width of [390, 360]) {
  test(`${width} px: the open row's tray lies wholly inside the row, with a group and no sideways page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await row(page, "Позвонить").getByText(/Позвонить/).tap();
    const box = (await row(page, "Позвонить").boundingBox())!;
    const items = await tray(page, "Позвонить").locator(":scope > *").all();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) await expectInside(item, box);
    const scroll = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: innerWidth }));
    expect(scroll.sw).toBeLessThanOrEqual(scroll.iw);
  });
}

test("hovering the open row changes nothing", async ({ page }) => {
  await row(page, "Хлеб").getByText("Хлеб").tap();
  const before = await row(page, "Хлеб").boundingBox();
  await row(page, "Хлеб").hover();
  const after = await row(page, "Хлеб").boundingBox();
  expect(after).toEqual(before);
});

test("repeat sheet: a day chip keeps the sheet and the row open; the scrim closes only the sheet", async ({ page }) => {
  // On the Backlog (ruling C2): a Day row turns into a definition shown only on its weekdays once repeating.
  await tool(page, "capture_task", { title: "Кофе", view: "backlog" });
  await page.goto("/g/all");
  await expect(page.getByRole("region", { name: "Бэклог" })).toBeVisible();
  await row(page, "Кофе").getByText("Кофе").tap();
  await tray(page, "Кофе").getByLabel("Повтор").tap();
  const sheet = page.getByRole("dialog", { name: "Повтор" });
  await settled(sheet);
  await expectInViewport(page, sheet);
  await sheet.getByRole("button", { name: "пн" }).tap();
  await expect(sheet).toBeVisible();
  await expect(tray(page, "Кофе")).toBeVisible();
  // Over the open row itself, above the sheet: were the scrim gone at pointerdown, the click would land on this
  // row and fold it (the top bar, where a tap could hide that, lies outside the list).
  const r = (await row(page, "Кофе").boundingBox())!;
  const at = { x: r.x + r.width / 2, y: r.y + 8 };
  expect(at.y).toBeLessThan((await sheet.boundingBox())!.y);
  expect(await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y)[0]!.hasAttribute("data-scrim"), at)).toBe(true);
  await page.touchscreen.tap(at.x, at.y);
  await expect(sheet).toHaveCount(0);
  await expect(tray(page, "Кофе")).toBeVisible();
});

test("steps sheet: ticking a step keeps the sheet and the row open", async ({ page }) => {
  await row(page, "Хлеб").getByText("Хлеб").tap();
  await tray(page, "Хлеб").getByLabel("Шаги").tap();
  const sheet = page.getByRole("dialog", { name: "Шаги" });
  await sheet.getByRole("textbox", { name: "Новый шаг" }).first().fill("Взять пакет");
  await sheet.getByRole("textbox", { name: "Новый шаг" }).first().press("Enter");
  await sheet.getByRole("button", { name: "Отметить: Взять пакет" }).tap();
  await expect(sheet).toBeVisible();
  await expect(tray(page, "Хлеб")).toBeVisible();
});

test("a long tap opens the title sheet", async ({ page }) => {
  await longPress(row(page, "Хлеб").getByText("Хлеб"));
  await expect(page.getByRole("dialog", { name: "Название задачи" })).toBeVisible();
  await expect(tray(page, "Хлеб")).toHaveCount(0);
});

test("a long tap on a group in the menu opens its edit sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Меню" }).tap();
  await longPress(page.getByRole("navigation").getByRole("button", { name: /Очень длинное/ }));
  await expect(page.getByRole("textbox", { name: "Название" })).toBeVisible();
});
