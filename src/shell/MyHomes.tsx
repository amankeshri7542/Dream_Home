// "My homes": every home kept on this device, newest first. Open one to carry
// on with it; the home you leave stays safe here. Deleting asks first.
import { useEffect, useState } from "react";
import { Dialog, DialogHeading } from "../components/Controls";
import { MiniPlan } from "../components/GuidedStart";
import type { Project } from "../domain/types";
import { MAX_HOMES, type HomeEntry } from "../homes/shelf";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import "./homes.css";

const DAY = 24 * 3600 * 1000;
export function editedWhen(at: number, now = Date.now()): string {
  if (!at) return "";
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY);
  if (now - at < 60_000) return "Edited just now";
  if (days <= 0) return "Edited today";
  if (days === 1) return "Edited yesterday";
  if (days < 7) return `Edited ${days} days ago`;
  return `Edited on ${new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

const summary = (h: HomeEntry) =>
  `${h.bedrooms} bedroom${h.bedrooms === 1 ? "" : "s"} · ${h.floors} floor${h.floors === 1 ? "" : "s"}`;

export function MyHomesDialog({
  onClose,
  onOpened,
  onStartNew,
}: {
  onClose: () => void;
  /** A home was opened (the title screen steps aside). */
  onOpened: () => void;
  onStartNew: () => void;
}) {
  const { homes, project, notify } = useEditor();
  const [previews, setPreviews] = useState<Record<string, Project | null>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mini plans for the homes that aren't open, read once from the device.
  useEffect(() => {
    let live = true;
    for (const h of homes.list)
      if (h.id !== homes.activeId && !(h.id in previews))
        void homes.read(h.id).then((p) => live && setPreviews((all) => ({ ...all, [h.id]: p })));
    return () => {
      live = false;
    };
    // Only when the list itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homes.list, homes.activeId]);

  const open = async (h: HomeEntry) => {
    if (busy) return;
    setBusy(true);
    const outcome = await homes.open(h.id);
    setBusy(false);
    if (outcome !== "ok") return notify(homes.explain(outcome), "error");
    onClose();
    onOpened();
    notify(`${h.name} is open. Your other homes are safe in My homes.`, "success");
  };
  const remove = async (h: HomeEntry) => {
    const outcome = await homes.remove(h.id);
    setConfirming(null);
    if (outcome !== "ok") return notify(homes.explain(outcome), "error");
    notify(`${h.name} was deleted.`);
  };

  return (
    <Dialog label="My homes" onClose={onClose}>
      <DialogHeading title="My homes" language="en" onClose={onClose} />
      <div className="dh-homes">
        <p className="dh-homes-lead">
          {homes.list.length} of {MAX_HOMES} homes kept on this device. Open one to carry on with it.
        </p>
        <ul className="dh-homes-list">
          {homes.list.map((h) => {
            const active = h.id === homes.activeId;
            const preview = active ? project : previews[h.id];
            return (
              <li key={h.id} className={`dh-home-card${active ? " is-active" : ""}`}>
                <div className="dh-home-thumb">
                  {preview ? <MiniPlan project={preview} /> : <Icon.home size={28} aria-hidden />}
                </div>
                <div className="dh-home-info">
                  <strong>{active ? project.name : h.name}</strong>
                  <span>{summary(h)}</span>
                  {active ? (
                    <span className="dh-home-badge">
                      <Icon.check size={16} aria-hidden /> Open now
                    </span>
                  ) : (
                    <span>{editedWhen(h.updatedAt)}</span>
                  )}
                </div>
                {confirming === h.id ? (
                  <div className="dh-home-confirm" role="group" aria-label={`Delete ${h.name}?`}>
                    <span>Delete it for good?</span>
                    <Button variant="secondary" onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                    <Button variant="danger" onClick={() => void remove(h)}>
                      Delete
                    </Button>
                  </div>
                ) : active ? null : (
                  <div className="dh-home-actions">
                    <Button variant="primary" aria-label={`Open ${h.name}`} disabled={busy} onClick={() => void open(h)}>
                      Open
                    </Button>
                    <IconButton
                      icon={Icon.remove}
                      tone="plain"
                      label={`Delete ${h.name}`}
                      onClick={() => setConfirming(h.id)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <Button
          variant="secondary"
          size="lg"
          full
          icon={Icon.add}
          disabled={homes.full}
          onClick={() => {
            onClose();
            onStartNew();
          }}
        >
          Start a new home
        </Button>
        <p className="dh-homes-note">
          {homes.persistent
            ? "Homes stay in this browser. Save a backup file (More → Save a copy of my home) before changing phones."
            : "This browser can keep only the open home. Save a backup file to keep others."}
        </p>
      </div>
    </Dialog>
  );
}
