import { liveUrl } from "../account";
import { httpApi } from "../platform/api";
import { connectLive } from "../platform/live";
import { Store } from "../store/store";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The page's store wired to the real server, the tab's live socket and localStorage. */
export function createStore(): Store {
  // One id per tab: the server skips this tab's socket when it announces this tab's own writes.
  const conn = crypto.randomUUID();
  return new Store({
    api: httpApi(),
    clock: () => Date.now(),
    conn,
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    storage: browserStorage(),
    live: (h) => connectLive(liveUrl(window.location, conn), h),
  });
}
