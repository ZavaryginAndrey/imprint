import type { Api, CallOutcome, Snapshot, StateOutcome } from "../platform/api";

/** A scriptable server for store tests: each call waits until the test resolves it. */
export function fakeApi(snapshot: Snapshot) {
  const calls: { name: string; input: unknown; ids: readonly string[]; resolve(o: CallOutcome): void }[] = [];
  let state: StateOutcome = { kind: "ok", snapshot };
  let stateReads = 0;
  const api: Api = {
    me: async () => ({ kind: "in", sub: "u1", email: "u1@example.test" }),
    state: async () => {
      stateReads++;
      return state;
    },
    call: (name, input, { ids }) => new Promise((resolve) => calls.push({ name, input, ids, resolve })),
    logout: async () => {},
  };
  return {
    api,
    calls,
    setState: (s: StateOutcome) => {
      state = s;
    },
    stateReads: () => stateReads,
  };
}

/** A Storage in memory (tests run in Node). */
export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}
