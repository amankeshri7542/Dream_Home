// Share: a link anyone can open in 3D, plus the other ways to share (a photo,
// plan drawings, a backup file). Making the link is one tap; sending it is a
// second, fresh tap, because phones only open their share sheet right after
// a tap.
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogHeading, Switch } from "../components/Controls";
import { download } from "../domain/export";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";
import { deleteShare, shareStats, updateShare } from "./api";
import { fingerprint, forgetLink, linkFor, saveLink, shareUrl, type ShareLink } from "./links";
import { addPicture, publishHome } from "./publish";
import "./share.css";
import { pwa } from "../pwa/pwa";
import { feedback } from "../ui/feedback";

export const SHARE_TEXT = "See our dream home in 3D 🏠";

export function ShareSheet({
  onClose,
  capture,
  onTakePhoto,
  onMakeVideo,
  onPlans,
}: {
  onClose: () => void;
  /** A snapshot of the 3D view for the link's preview picture. */
  capture: () => Promise<Blob | null>;
  onTakePhoto: () => void;
  onMakeVideo: () => void;
  onPlans: () => void;
}) {
  const { project, homes, notify } = useEditor();
  const homeId = homes.activeId;
  const [link, setLink] = useState<ShareLink | null>(() => linkFor(homeId));
  const [showName, setShowName] = useState(link?.showName ?? true);
  const [showCity, setShowCity] = useState(link?.showCity ?? false);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [stats, setStats] = useState<{ views: number; remixes: number } | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const print = useMemo(() => fingerprint(project), [project]);
  const url = link ? shareUrl(link.id) : "";
  const changed = !!link && link.fingerprint !== print;

  useEffect(() => {
    if (!link) return;
    let live = true;
    void shareStats(link.id, link.token).then((r) => live && r.ok && setStats({ views: r.views, remixes: r.remixes }));
    return () => {
      live = false;
    };
  }, [link]);

  const make = async () => {
    setProblem("");
    setBusy("Making your link…");
    const res = await publishHome(project, homeId, { showName, showCity }, capture, setBusy);
    setBusy("");
    if (!res.ok) return setProblem(res.message);
    setLink(res.link);
    feedback.success();
    pwa.shared();
  };

  const update = async () => {
    if (!link) return;
    setProblem("");
    setBusy("Updating your link…");
    const options = { showName, showCity };
    const res = await updateShare(link.id, link.token, project, options);
    if (!res.ok) {
      setBusy("");
      return setProblem(res.message);
    }
    setBusy("Adding a picture…");
    await addPicture(project, { ...link, ...options }, capture);
    const next = { ...link, ...options, updatedAt: res.updatedAt, fingerprint: print };
    saveLink(homeId, next);
    setLink(next);
    setBusy("");
    notify("Link updated. Everyone with it now sees the new version.", "success");
  };

  const stop = async () => {
    if (!link) return;
    setBusy("Stopping…");
    const res = await deleteShare(link.id, link.token);
    setBusy("");
    setConfirmStop(false);
    // A link that's already gone is as good as stopped.
    if (!res.ok && res.reason !== "missing") return setProblem(res.message);
    forgetLink(homeId);
    setLink(null);
    setStats(null);
    notify("Sharing stopped. Within a minute, the old link won’t open this home.");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify("Link copied. Paste it in WhatsApp or anywhere.", "success");
    } catch {
      notify("Press and hold the link to copy it.");
    }
  };
  const send = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: project.name, text: SHARE_TEXT, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy();
  };

  return (
    <Dialog label="Share your home" onClose={onClose}>
      <DialogHeading title="Share your home" language="en" onClose={onClose} />
      <div className="dh-sharesheet">
        {link ? (
          <section className="dh-share-link" aria-label="Your link">
            <p className="dh-share-lead">Anyone with this link can walk around your home in 3D. No app needed.</p>
            <input
              className="dh-share-url"
              readOnly
              value={url}
              aria-label="Your home’s link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="dh-share-actions">
              <Button variant="primary" size="lg" icon={Icon.share} onClick={() => void send()}>
                Send link
              </Button>
              <Button variant="secondary" size="lg" icon={Icon.duplicate} onClick={() => void copy()}>
                Copy
              </Button>
              <a
                className="dh-btn dh-btn-secondary dh-btn-lg dh-share-whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            </div>
            {stats && (
              <p className="dh-share-stats" aria-live="polite">
                <span>👀 {stats.views} {stats.views === 1 ? "view" : "views"}</span>
                <span>🔁 {stats.remixes} {stats.remixes === 1 ? "remix" : "remixes"}</span>
              </p>
            )}
            {changed && (
              <div className="dh-share-changed">
                <p>You’ve changed this home since you shared it.</p>
                <Button variant="primary" icon={Icon.upload} disabled={!!busy} onClick={() => void update()}>
                  Update link
                </Button>
              </div>
            )}
            {confirmStop ? (
              <div className="dh-share-stop" role="group" aria-label="Stop sharing?">
                <span>The link will stop working for everyone.</span>
                <Button variant="secondary" onClick={() => setConfirmStop(false)}>
                  Keep sharing
                </Button>
                <Button variant="danger" disabled={!!busy} onClick={() => void stop()}>
                  Stop sharing
                </Button>
              </div>
            ) : (
              <button type="button" className="dh-title-link dh-share-stop-link" onClick={() => setConfirmStop(true)}>
                Stop sharing this link
              </button>
            )}
          </section>
        ) : (
          <section className="dh-share-link" aria-label="Make a link">
            <p className="dh-share-lead">
              Make a link your family can open on any phone to walk around your home in 3D. No app needed.
            </p>
            <div className="dh-share-privacy">
              <Icon.check size={18} aria-hidden />
              <p>Anyone with the link can see this home. You can update it or stop sharing anytime.</p>
            </div>
            <Switch label="Show my home’s name" checked={showName} onChange={() => setShowName(!showName)} />
            {project.plot.location && (
              <Switch label="Show my city" checked={showCity} onChange={() => setShowCity(!showCity)} />
            )}
            <Button variant="primary" size="lg" full icon={Icon.share} disabled={!!busy} onClick={() => void make()}>
              Make my link
            </Button>
          </section>
        )}
        {busy && (
          <p className="dh-share-busy" role="status">
            {busy}
          </p>
        )}
        {problem && (
          <p className="dh-inline-error" role="alert">
            <Icon.warning size={18} aria-hidden />
            <span>{problem}</span>
          </p>
        )}
        <section className="dh-share-more" aria-label="More ways to share">
          <h3>More ways to share</h3>
          <button type="button" className="menu-row" onClick={onMakeVideo}>
            <Icon.video size={21} aria-hidden />
            Make a video
            <Icon.right size={17} aria-hidden />
          </button>
          <button type="button" className="menu-row" onClick={onTakePhoto}>
            <Icon.photo size={21} aria-hidden />
            Take a photo
            <Icon.right size={17} aria-hidden />
          </button>
          <button type="button" className="menu-row" onClick={onPlans}>
            <Icon.floorPlan size={21} aria-hidden />
            Plan drawings (picture)
            <Icon.right size={17} aria-hidden />
          </button>
          <button
            type="button"
            className="menu-row"
            onClick={() =>
              download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), "dream-home.json")
            }
          >
            <Icon.download size={21} aria-hidden />
            Backup file
            <Icon.right size={17} aria-hidden />
          </button>
        </section>
      </div>
    </Dialog>
  );
}
