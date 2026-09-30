import { describe, expect, it } from "vitest";
import { AuthError, GOOGLE_TOKEN_URL, authUrl, exchangeCode, idTokenClaims, pkceChallenge, randomToken } from "../src/auth/google";
import { b64url } from "../src/auth/token";

const CLIENT = "client-1.apps.googleusercontent.com";
const NOW = 1_790_000_000;
const fakeIdToken = (claims: Record<string, unknown>) =>
  ["e30", b64url(new TextEncoder().encode(JSON.stringify(claims))), "sig"].join(".");
const good = { iss: "https://accounts.google.com", aud: CLIENT, sub: "g-123", email: "me@example.test", email_verified: true, exp: NOW + 3600 };

describe("PKCE and the auth URL", () => {
  it("pkceChallenge matches RFC 7636 appendix B", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("randomToken is 43 url-safe chars for 32 bytes and never repeats", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it("authUrl asks Google for a code with S256 PKCE, openid email scope and our state", () => {
    const u = new URL(authUrl({ clientId: CLIENT, redirectUri: "https://x.test/auth/callback", state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: CLIENT, redirect_uri: "https://x.test/auth/callback", response_type: "code",
      scope: "openid email", state: "st", code_challenge: "ch", code_challenge_method: "S256",
    });
  });
});

describe("exchangeCode", () => {
  const params = { code: "c0de", verifier: "v", clientId: CLIENT, clientSecret: "s3cret", redirectUri: "https://x.test/auth/callback" };

  it("posts the code with the verifier and returns the id_token", async () => {
    let seenUrl = "";
    let seenBody = new URLSearchParams();
    const id = await exchangeCode(params, async (url, init) => {
      seenUrl = url;
      seenBody = new URLSearchParams(String(init.body));
      return Response.json({ id_token: "tok" });
    });
    expect(id).toBe("tok");
    expect(seenUrl).toBe(GOOGLE_TOKEN_URL);
    expect(Object.fromEntries(seenBody)).toEqual({
      grant_type: "authorization_code", code: "c0de", code_verifier: "v", client_id: CLIENT,
      client_secret: "s3cret", redirect_uri: "https://x.test/auth/callback",
    });
  });

  it("a non-2xx answer or a missing id_token is an AuthError", async () => {
    await expect(exchangeCode(params, async () => Response.json({ error: "invalid_grant" }, { status: 400 }))).rejects.toBeInstanceOf(AuthError);
    await expect(exchangeCode(params, async () => Response.json({ access_token: "x" }))).rejects.toBeInstanceOf(AuthError);
  });
});

describe("idTokenClaims", () => {
  it("returns sub and the verified email", () => {
    expect(idTokenClaims(fakeIdToken(good), CLIENT, NOW)).toEqual({ sub: "g-123", email: "me@example.test" });
  });

  it("an unverified email is dropped, not trusted", () => {
    expect(idTokenClaims(fakeIdToken({ ...good, email_verified: false }), CLIENT, NOW).email).toBeNull();
  });

  it("wrong audience, wrong issuer, expiry, missing sub or garbage throw AuthError", () => {
    const bad = [
      fakeIdToken({ ...good, aud: "someone-else" }),
      fakeIdToken({ ...good, iss: "https://evil.example" }),
      fakeIdToken({ ...good, exp: NOW }),
      fakeIdToken({ ...good, sub: "" }),
      "not-a-jwt",
      "a.!!!.c",
    ];
    for (const token of bad) expect(() => idTokenClaims(token, CLIENT, NOW)).toThrow(AuthError);
  });

  it("accepts the bare issuer form and an audience array", () => {
    expect(idTokenClaims(fakeIdToken({ ...good, iss: "accounts.google.com", aud: [CLIENT] }), CLIENT, NOW).sub).toBe("g-123");
  });
});
