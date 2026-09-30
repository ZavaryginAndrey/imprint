import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/fonts";
import "../styles/tokens.css";
import "../styles/base.css";
import { App } from "./App";
import { installGroupColors } from "./groupColors";

installGroupColors();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
