import { expect, test } from "@playwright/test";
import { longPress } from "./helpers";
import { saved, signIn, tool } from "./session";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

// «Удалить группу» closes the edit sheet but leaves the drawer open: the toast must lie above the drawer's scrim,
// or a tap on «Отменить» only closes the drawer.
test("a group deleted from the drawer: «Отменить» on the toast brings it back while the drawer stays open", async ({ page }) => {
  await page.goto("/");
  await tool(page, "create_group", { name: "Дом" });
  await page.reload();
  await page.getByRole("button", { name: "Меню" }).tap();
  const drawer = page.getByRole("dialog", { name: "Меню" });
  await longPress(drawer.getByRole("button", { name: /Дом/ }));
  await page.getByRole("button", { name: /Удалить группу/ }).tap();
  await expect(drawer.getByRole("button", { name: /Дом/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Отменить" }).tap();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Дом/ })).toBeVisible();
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Меню" }).tap();
  await expect(page.getByRole("navigation").getByRole("button", { name: /Дом/ })).toBeVisible();
});
