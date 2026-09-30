import { isRecord, signToken, verifyToken } from "./token";

/** The session cookie (ADR 005): stateless, HMAC-signed, `kind: "session"`. */
export const SESSION_COOKIE = "imprint_session";
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
export const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

export interface Session {
  /** Google `sub` — the user id and the Durable Object name. */
  sub: string;
  email: string | null;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const nowSec = (): number => Math.floor(Date.now() / 1000);

export function encodeSession(secret: string, who: { sub: string; email: string | null }, issuedAt: number = nowSec()): Promise<string> {
  return signToken(secret, { kind: "session", sub: who.sub, email: who.email, exp: issuedAt + SESSION_TTL_SEC });
}

export async function decodeSession(secret: string, token: string, at: number = nowSec()): Promise<Session | null> {
  const p = await verifyToken(secret, token);
  if (!isRecord(p) || p.kind !== "session") return null;
  if (typeof p.sub !== "string" || p.sub === "" || typeof p.exp !== "number" || p.exp <= at) return null;
  return { sub: p.sub, email: typeof p.email === "string" ? p.email : null, exp: p.exp };
}
