import { useEffect, useState } from "react";
import { Shell } from "../components/Shell";
import { Sidebar } from "../components/Sidebar";
import { Toasts } from "../components/Toasts";
import { DayScreen } from "../screens/DayScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { MetaStub } from "../screens/MetaStub";
import { StoreContext, useStore } from "../store/hooks";
import { createStore } from "./createStore";
import { useRoute } from "./router";
import { useRouteGuards } from "./useRouteGuards";

export function App() {
  const [store] = useState(createStore);

  useEffect(() => {
    void store.start();
    const visible = () => document.visibilityState === "visible" && store.refreshDay();
    document.addEventListener("visibilitychange", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      store.stop();
    };
  }, [store]);

  return (
    <StoreContext.Provider value={store}>
      <Root />
    </StoreContext.Provider>
  );
}

function Root() {
  const auth = useStore((s) => s.auth);
  const [route, go] = useRoute();
  useRouteGuards(route, go);

  // Day and Backlog live in the Day world; History and Settings — the whole screen — in Meta (UX §2, §6).
  const world = auth === "in" && route.screen !== "day" ? "meta" : "day";
  useEffect(() => {
    document.documentElement.dataset.world = world;
  }, [world]);

  // The queue lives in memory: closing the tab before the server confirmed would lose the action.
  const waiting = useStore((s) => s.pending > 0);
  useEffect(() => {
    document.documentElement.dataset.pending = String(waiting);
    if (!waiting) return;
    const hold = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [waiting]);

  if (auth === "unknown") return null;
  if (auth !== "in") {
    const failed = new URLSearchParams(window.location.search).get("login") === "failed";
    return <LoginScreen down={auth === "down"} failed={failed} />;
  }
  return (
    <>
      <Shell sidebar={<Sidebar route={route} go={go} />}>
        {route.screen === "day" ? <DayScreen filter={route.filter} /> : <MetaStub screen={route.screen} />}
      </Shell>
      <Toasts />
    </>
  );
}
