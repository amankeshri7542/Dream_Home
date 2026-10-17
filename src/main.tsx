import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./styles.css";
import "./builder.css";
import "./studio.css";
import "./ui/styles/skin.css";
import "./ui/styles/textsize.css";
import App from "./App";
// A new version was deployed while this page was open, so its old lazy chunks
// are gone: reload once (not in a loop) to pick up the new one.
window.addEventListener("vite:preloadError", (event) => {
  const key = "dream-home.update-reload";
  try {
    const last = Number(sessionStorage.getItem(key) ?? "0");
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
