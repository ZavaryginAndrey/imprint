import { createContext, useContext } from "react";

/** UX §1: ≥ 1024 px — desktop (sidebar + two columns); narrower — mobile (one column, a drawer, sheets). */
export type Layout = "desktop" | "mobile";
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** The app provides it from the window's width; without a provider (component tests) it is the desktop. */
export const LayoutContext = createContext<Layout>("desktop");
export const useLayout = (): Layout => useContext(LayoutContext);
