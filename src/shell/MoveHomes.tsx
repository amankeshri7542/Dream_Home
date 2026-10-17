// Carrying homes to Dream Home's new address (see homes/handoff.ts): a banner
// on the old address, and a welcome on the new one.
import { useEffect, useState } from "react";
import { Dialog } from "../components/Controls";
import { MiniPlan } from "../components/GuidedStart";
import type { Project } from "../domain/types";
import { useEditor } from "../editor/EditorProvider";
import { MAX_LINK, importFragment, moveLink, offersMove, packHome, unpackHome } from "../homes/handoff";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { addHome } from "./Dialogs";
import "./homes.css";

/** On the old address: one tap moves the open home to the new one. */
export function MoveBanner() {
  const { project, notify } = useEditor();
  const [hidden, setHidden] = useState(false);
  if (hidden || !offersMove(window.location)) return null;
  const move = async () => {
    try {
      const packed = await packHome(project);
      if (packed.length > MAX_LINK)
        return notify(
          "This home is too big to move by link. Save a copy (More → Save a copy of my home) and open it on the new address.",
          "error",
        );
      window.location.assign(moveLink(packed));
    } catch {
      notify("Couldn’t prepare the move. Save a copy of your home instead.", "error");
    }
  };
  return (
    <div className="dh-move-banner" role="region" aria-label="Dream Home has a new address" data-chrome="move">
      <Icon.home size={20} aria-hidden />
      <p>
        <strong>Dream Home has a new address.</strong> Bring {project.name} with you.
      </p>
      <Button variant="primary" onClick={() => void move()}>
        Move my home
      </Button>
      <IconButton icon={Icon.close} tone="plain" label="Not now" onClick={() => setHidden(true)} />
    </div>
  );
}

/** On the new address: a home that arrived by a move link joins My homes. */
export function ImportFromLink({ onAdded }: { onAdded: () => void }) {
  const editor = useEditor();
  const [home, setHome] = useState<Project | null>(null);
  useEffect(() => {
    const packed = importFragment(window.location.hash);
    if (!packed) return;
    // The home stays out of the address bar, history and any later share.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    unpackHome(packed).then(setHome, () =>
      editor.notify("The home in that link couldn’t be opened. Save a copy on the old address and open it here.", "error"),
    );
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!home) return null;
  const close = () => setHome(null);
  return (
    <Dialog label="Bring this home here" onClose={close}>
      <div className="dh-import">
        <div className="dh-home-thumb">
          <MiniPlan project={home} />
        </div>
        <h2>Bring {home.name} here?</h2>
        <p>It will join My homes on this address, ready to keep building.</p>
        <Button
          variant="primary"
          size="lg"
          full
          onClick={async () => {
            if (!(await addHome(editor, home, "Bring a home here"))) return;
            close();
            onAdded();
            editor.notify(`${home.name} is here. Welcome to the new address!`, "success");
          }}
        >
          Add to My homes
        </Button>
        <Button variant="secondary" size="lg" full onClick={close}>
          Not now
        </Button>
      </div>
    </Dialog>
  );
}
