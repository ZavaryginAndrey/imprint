import { describe, expect, it } from "vitest";
import { SESSION_TTL_SEC, decodeSession, encodeSession } from "../src/auth/session";
import { b64url, fromB64url, signToken, verifyToken } from "../src/auth/token";

const SECRET = "unit-secret";
const NOW = 1_790_000_000;

describe("signed tokens", () => {
  it("base64url round-trips any bytes", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    expect(fromB64url(b64url(bytes))).toEqual(bytes);
    expect(b64url(bytes)).not.toMatch(/[+/=]/);
  });

  it("verify returns the payload for its own signature only", async () => {
    const token = await signToken(SECRET, { kind: "x", n: 1 });
    expect(await verifyToken(SECRET, token)).toEqual({ kind: "x", n: 1 });
    expect(await verifyToken("other-secret", token)).toBeNull();
  });

  it("a tampered payload, signature or shape is null, never a throw", async () => {
    const token = await signToken(SECRET, { sub: "a" });
    const [body, sig] = token.split(".");
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ sub: "b" })));
    expect(await verifyToken(SECRET, `${forged}.${sig}`)).toBeNull();
    // Flip the first signature char — fully significant (the last char carries unused padding bits).
    expect(await verifyToken(SECRET, `${body}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`)).toBeNull();
    expect(await verifyToken(SECRET, body)).toBeNull();
    expect(await verifyToken(SECRET, `${token}.extra`)).toBeNull();
    expect(await verifyToken(SECRET, "!!!.???")).toBeNull();
    expect(await verifyToken(SECRET, "")).toBeNull();
  });
});

describe("sessions", () => {
  it("round-trips sub and email with a 30-day expiry", async () => {
    const token = await encodeSession(SECRET, { sub: "g-1", email: "me@example.test" }, NOW);
    expect(await decodeSession(SECRET, token, NOW + 1)).toEqual({ sub: "g-1", email: "me@example.test", exp: NOW + SESSION_TTL_SEC });
  });

  it("an expired session is null", async () => {
    const token = await encodeSession(SECRET, { sub: "g-1", email: null }, NOW);
    expect(await decodeSession(SECRET, token, NOW + SESSION_TTL_SEC)).toBeNull();
  });

  it("a validly signed token of another kind (the login cookie) is not a session", async () => {
    const token = await signToken(SECRET, { kind: "oauth", sub: "g-1", exp: NOW + 600 });
    expect(await decodeSession(SECRET, token, NOW)).toBeNull();
  });

  it("an empty sub is not a session", async () => {
    const token = await signToken(SECRET, { kind: "session", sub: "", email: null, exp: NOW + 600 });
    expect(await decodeSession(SECRET, token, NOW)).toBeNull();
  });
});
