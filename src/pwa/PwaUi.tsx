// The installed-app bits on screen: "A new version is ready", the "Install
// Dream Home" nudge (with the iPhone steps), and the More menu's install row.
import { useState, useSyncExternalStore } from "react";
import { offersMove } from "../homes/handoff";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { pwa } from "./pwa";
import "./pwa.css";

const usePwa = () => useSyncExternalStore(pwa.subscribe, pwa.get);
const IPHONE_STEPS = "In Safari, tap Share (the square with an arrow), then “Add to Home Screen”.";

/** A new version is waiting: one tap swaps it in (the page reloads). */
export function UpdateBanner() {
  const { update } = usePwa();
  if (!update) return null;
  return (
    <div className="dh-move-banner dh-pwa-banner" role="status" data-chrome="move">
      <Icon.sparkle size={20} aria-hidden />
      <p>
        <strong>A new version of Dream Home is ready.</strong> Your home is saved.
      </p>
      <Button variant="primary" onClick={() => pwa.update()}>
        Update
      </Button>
    </div>
  );
}

/** From the second visit (or after a first share): put Dream Home on the home screen. */
export function InstallNudge() {
  const { nudge, update, canInstall } = usePwa();
  const [steps, setSteps] = useState(false);
  if (!nudge || update || offersMove(window.location)) return null;
  return (
    <div className="dh-move-banner dh-pwa-banner" role="region" aria-label="Install Dream Home" data-chrome="move">
      <Icon.home size={20} aria-hidden />
      <p>
        <strong>Install Dream Home.</strong> {steps ? IPHONE_STEPS : "It opens from your home screen like an app, even offline."}
      </p>
      {canInstall ? (
        <Button variant="primary" onClick={() => void pwa.install()}>
          Install
        </Button>
      ) : (
        !steps && (
          <Button variant="primary" onClick={() => setSteps(true)}>
            How?
          </Button>
        )
      )}
      <IconButton icon={Icon.close} tone="plain" label="Not now" onClick={() => pwa.snooze()} />
    </div>
  );
}

/** More → Install Dream Home: the browser's prompt, or how to do it on this phone. */
export function InstallRow() {
  const { installed, canInstall, ios } = usePwa();
  if (installed) return null;
  if (canInstall)
    return (
      <button className="menu-row" onClick={() => void pwa.install()}>
        <Icon.download size={21} aria-hidden />
        Install Dream Home
        <Icon.right size={17} aria-hidden />
      </button>
    );
  return (
    <details className="plain-details">
      <summary>Install Dream Home</summary>
      <p className="field-note">
        {ios ? IPHONE_STEPS : "In Chrome, open the browser menu (⋮) and choose “Install app” or “Add to home screen”."} It then
        opens like an app, even offline.
      </p>
      <p className="field-note">
        Your homes stay in this browser. Save a copy of each before changing phones or clearing browser data.
      </p>
    </details>
  );
}
