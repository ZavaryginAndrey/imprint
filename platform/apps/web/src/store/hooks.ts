import { createContext, useContext, useSyncExternalStore } from "react";
import type { Store, StoreState } from "./store";
import type { View } from "./view";

export const StoreContext = createContext<Store | null>(null);

export function useStoreApi(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreContext is missing");
  return store;
}

/** A slice of the store's state; the component re-renders when the slice changes (by identity). */
export function useStore<T>(select: (s: StoreState) => T): T {
  const store = useStoreApi();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

export const useView = (): View | null => useStore((s) => s.view);
