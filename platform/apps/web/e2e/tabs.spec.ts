import { expect, test } from "@playwright/test";
import { signIn } from "./session";

test("an edit in one tab shows in another with no action (W4 «готово, когда»)", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const sub = await signIn(a);
  await signIn(b, sub);
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  await pageA.goto("/");
  await pageB.goto("/");
  await expect(pageB.getByRole("heading", { name: "День" })).toBeVisible();

  const input = pageA.getByRole("textbox", { name: "Что не забыть?" });
  await input.fill("Купить хлеб");
  await input.press("Enter");

  await expect(pageB.getByRole("region", { name: "День" }).getByText("Купить хлеб")).toBeVisible({ timeout: 5000 });

  await pageB.getByRole("button", { name: "Отметить: Купить хлеб" }).click();
  await expect(pageA.getByRole("button", { name: "Вернуть: Купить хлеб" })).toBeVisible({ timeout: 5000 });
  await a.close();
  await b.close();
});
