import { expect, test } from "@playwright/test";
import { signIn, tool } from "./session";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("addresses, Back and reload keep the place (UX §2)", async ({ page }) => {
  await page.goto("/");
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await page.reload();
  const nav = page.getByRole("navigation");

  await nav.getByRole("button", { name: /^Дом/ }).click();
  await expect(page).toHaveURL(`/g/${g.id}`);
  await expect(nav.getByRole("button", { name: /^Дом/ })).toHaveAttribute("aria-pressed", "true");

  await nav.getByRole("button", { name: "История" }).click();
  await expect(page).toHaveURL("/history");
  await expect(page.locator("html")).toHaveAttribute("data-world", "meta");
  await expect(page.getByRole("heading", { name: "История" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(`/g/${g.id}`);
  await expect(page.locator("html")).toHaveAttribute("data-world", "day");

  await page.reload();
  await expect(page).toHaveURL(`/g/${g.id}`);
  await expect(page.getByRole("heading", { name: "Бэклог" })).toBeVisible();
  await expect(page.getByText("Дом", { exact: true }).first()).toBeVisible();
});

test("«/» opens with the last filter this browser used", async ({ page }) => {
  await page.goto("/");
  const g = (await tool(page, "create_group", { name: "Дом" })).group as { id: string };
  await page.goto(`/g/${g.id}`);
  await expect(page.getByRole("heading", { name: "Бэклог" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(`/g/${g.id}`);
});

test("a filter for a group deleted elsewhere falls back to «/»", async ({ page }) => {
  await page.goto("/");
  const g = (await tool(page, "create_group", { name: "Временная" })).group as { id: string };
  await tool(page, "delete_group", { groupId: g.id });
  await page.goto(`/g/${g.id}`);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("navigation").getByRole("button", { name: /Все задачи/ })).toHaveAttribute("aria-pressed", "true");
});
