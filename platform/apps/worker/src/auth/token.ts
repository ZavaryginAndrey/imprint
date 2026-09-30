/**
 * Compact HMAC-SHA256 tokens for our own cookies: `base64url(JSON).base64url(signature)`. The
 * signature check is `crypto.subtle.verify` (constant time). Anything malformed verifies to null.
 */

const encoder = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Throws on input that is not base64url. */
export function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(secret: string, payload: object): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${b64url(signature)}`;
}

/** The payload when `token` carries our signature over it; null otherwise. */
export async function verifyToken(secret: string, token: string): Promise<unknown | null> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(parts[1]), encoder.encode(parts[0]));
    return ok ? (JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))) as unknown) : null;
  } catch {
    return null;
  }
}
