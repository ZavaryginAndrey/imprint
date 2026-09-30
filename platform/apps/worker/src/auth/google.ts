import { b64url, fromB64url, isRecord } from "./token";

/** Google OAuth 2.0 authorization code + PKCE, server side (ADR 005). */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export class AuthError extends Error {}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

export function authUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Trade the code for tokens; returns the ID token. */
export async function exchangeCode(
  p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchFn: FetchFn,
): Promise<string> {
  const response = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      code_verifier: p.verifier,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
    }).toString(),
  });
  if (!response.ok) throw new AuthError(`token endpoint answered ${response.status}`);
  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body) || typeof body.id_token !== "string") throw new AuthError("no id_token");
  return body.id_token;
}

/**
 * Claims of an ID token that came straight from Google's token endpoint over TLS. OIDC Core §3.1.3.7
 * lets TLS stand in for the signature check in this case; issuer, audience and expiry are still checked.
 */
export function idTokenClaims(idToken: string, clientId: string, nowSec: number): { sub: string; email: string | null } {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new AuthError("malformed id_token");
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch {
    throw new AuthError("malformed id_token");
  }
  if (!isRecord(claims)) throw new AuthError("malformed id_token");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(String(claims.iss))) throw new AuthError("wrong issuer");
  if (!audiences.includes(clientId)) throw new AuthError("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) throw new AuthError("expired id_token");
  if (typeof claims.sub !== "string" || claims.sub === "") throw new AuthError("no sub");
  const email = typeof claims.email === "string" && claims.email_verified === true ? claims.email : null;
  return { sub: claims.sub, email };
}
