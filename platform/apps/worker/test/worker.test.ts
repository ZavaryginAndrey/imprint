import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://imprint.test";

describe("worker skeleton", () => {
  it("/health reports the domain tool catalog", async () => {
    const r = await SELF.fetch(`${BASE}/health`);
    expect(r.status).toBe(200);
    const body = await r.json<{ ok: boolean; tools: number }>();
    expect(body.ok).toBe(true);
    expect(body.tools).toBeGreaterThan(0);
  });

  it("an unknown /api path is a JSON 404, never the SPA page", async () => {
    const r = await SELF.fetch(`${BASE}/api/nope`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  });

  it("without assets (local/test config) any other path is 404", async () => {
    expect((await SELF.fetch(`${BASE}/g/some-group`)).status).toBe(404);
  });
});
