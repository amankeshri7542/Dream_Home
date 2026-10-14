import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./styles.css";
import "./builder.css";
import "./studio.css";
import "./ui/styles/skin.css";
import App from "./App";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
