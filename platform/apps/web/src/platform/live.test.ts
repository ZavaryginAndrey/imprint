import { describe, expect, it } from "vitest";
import { connectLive } from "./live";

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(m: string) {
    this.sent.push(m);
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const socket = (u: string) => new FakeSocket(u) as unknown as WebSocket;

describe("connectLive", () => {
  it("open → open(); push → changed(rev); pong ignored; 4001 → deleted() and reconnect", async () => {
    FakeSocket.all = [];
    const log: string[] = [];
    const waits: number[] = [];
    const live = connectLive(
      "ws://x/api/live",
      { open: () => log.push("open"), changed: (r) => log.push(`rev ${r}`), deleted: () => log.push("deleted") },
      { socket, wait: async (ms) => void waits.push(ms) },
    );
    const s = FakeSocket.all[0];
    s.onopen?.();
    s.onmessage?.({ data: JSON.stringify({ changed: true, rev: 7 }) });
    s.onmessage?.({ data: "pong" });
    s.onclose?.({ code: 4001 });
    await tick();
    expect(log).toEqual(["open", "rev 7", "deleted"]);
    expect(FakeSocket.all).toHaveLength(2);
    live.close();
    await tick();
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("backs off 1 s, 2 s, 4 s … while the socket keeps failing, and resets after an open", async () => {
    FakeSocket.all = [];
    const waits: number[] = [];
    const live = connectLive("ws://x", { open() {}, changed() {}, deleted() {} }, { socket, wait: async (ms) => void waits.push(ms) });
    for (let i = 0; i < 3; i++) {
      FakeSocket.all[FakeSocket.all.length - 1].onclose?.({ code: 1006 });
      await tick();
    }
    const last = FakeSocket.all[FakeSocket.all.length - 1];
    last.onopen?.();
    last.onclose?.({ code: 1006 });
    await tick();
    expect(waits).toEqual([1000, 2000, 4000, 1000]);
    live.close();
  });
});
