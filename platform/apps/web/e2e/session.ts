import { expect, type BrowserContext, type Page } from "@playwright/test";
import { E2E_SECRET, WEB } from "./env";

const SESSION_COOKIE = "imprint_session";

/** A fresh user per test: its own Durable Object, so tests never share data. */
export const newSub = () => `e2e-${crypto.randomUUID()}`;

/**
 * The worker's session cookie (ADR 005; `apps/worker/src/auth/token.ts`, `session.ts`):
 * `base64url(JSON).base64url(HMAC-SHA256)` over `{ kind: "session", sub, email, exp }`.
 */
async function sessionToken(secret: string, sub: string): Promise<string> {
  const enc = new TextEncoder();
  const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = { kind: "session", sub, email: `${sub}@example.test`, exp: Math.floor(Date.now() / 1000) + 86_400 };
  const body = b64(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64(await crypto.subtle.sign("HMAC", key, enc.encode(body)))}`;
}

/** Sign a context in as `sub` — no Google involved, no test route on the server. */
export async function signIn(context: BrowserContext, sub: string = newSub()): Promise<string> {
  const value = await sessionToken(E2E_SECRET, sub);
  await context.addCookies([{ name: SESSION_COOKIE, value, url: WEB, httpOnly: true, sameSite: "Lax" }]);
  return sub;
}

/** Call a tool as the signed-in user (seeding, or acting as «another device»). */
export async function tool(page: Page, name: string, input: unknown): Promise<Record<string, unknown>> {
  const r = await page.request.post(`/api/tools/${name}`, { data: input });
  const body = (await r.json()) as { result: Record<string, unknown> };
  return body.result;
}

/** Every action the page showed has been confirmed by the server (`html[data-pending]`). */
export async function saved(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-pending", "false");
}

/** A calendar date `days` from today in the user's zone (the e2e browser runs in Moscow). */
export function dateIn(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(Date.now() + days * 86_400_000));
}
