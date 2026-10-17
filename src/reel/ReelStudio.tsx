// The reel studio: a title, a style, a mood and music, then "Make my video".
// While filming it shows each frame as it's made; then the video is ready to
// share or save, with its caption copied for the post. Lazy (its own chunk).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { download } from "../domain/export";
import { DEFAULT_VIEW } from "../editor/state";
import { useEditor } from "../editor/EditorProvider";
import { Switch } from "../components/Controls";
import { Chips, Ring } from "../photo/PhotoStudio";
import { linkFor, shareUrl } from "../share/links";
import { publishHome } from "../share/publish";
import { Icon } from "../ui/icons";
import { Button, Field, IconButton } from "../ui/primitives";
import {
  MOOD_MUSIC,
  MOOD_ORDER,
  MUSIC_ORDER,
  REEL_MOODS,
  REEL_MUSIC,
  REEL_STYLES,
  STYLE_ORDER,
  reelCaption,
  type Feed,
  type ReelMood,
  type ReelMusic,
  type ReelOutcome,
  type ReelProgress,
  type ReelScene,
  type ReelSettings,
  type ReelStyle,
} from "./settings";
import "../photo/photo.css";
import "./reel.css";

type Phase =
  | { kind: "setup" }
  | { kind: "linking" }
  | { kind: "filming" }
  | { kind: "done"; blob: Blob; link: string | null; note: string }
  | { kind: "unsupported" };

const TITLE_MAX = 40;

export default function ReelStudio({
  onClose,
  onScene,
  render,
  feed,
  onCancel,
  capture,
  onTakePhoto,
}: {
  onClose: () => void;
  /** Shows the studio's preview while choosing (null when it closes). */
  onScene: (scene: ReelScene | null) => void;
  render: (settings: ReelSettings) => Promise<ReelOutcome>;
  feed: Feed<ReelProgress | null>;
  onCancel: () => void;
  /** A picture for a new share link's preview. */
  capture: () => Promise<Blob | null>;
  onTakePhoto: () => void;
}) {
  const { state, dispatch, project, homes, notify } = useEditor();
  const [title, setTitle] = useState(project.name.slice(0, TITLE_MAX));
  const [style, setStyle] = useState<ReelStyle>("grand");
  const [mood, setMood] = useState<ReelMood>("golden");
  const [music, setMusic] = useState<ReelMusic>(MOOD_MUSIC.golden);
  const [musicPicked, setMusicPicked] = useState(false);
  const [livedIn, setLivedIn] = useState(state.view.livedIn !== false);
  const existing = linkFor(homes.activeId);
  const [showLink, setShowLink] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const progress = useSyncExternalStore(feed.subscribe, feed.get, feed.get);
  const url = useMemo(() => (phase.kind === "done" ? URL.createObjectURL(phase.blob) : ""), [phase]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  const latest = useRef({ onScene, onCancel, filming: false });
  latest.current = { onScene, onCancel, filming: phase.kind === "filming" };

  // The live view: the finished home in the mood's light (filming takes it over, shot by shot).
  useEffect(() => {
    if (phase.kind === "filming") return;
    const light = REEL_MOODS[mood];
    latest.current.onScene({
      key: `preview:${mood}:${livedIn}`,
      hour: light.hour,
      view: { ...DEFAULT_VIEW, floor: "all", stage: 5, roof: true, cutaway: false, walls: true, labels: false, livedIn, festive: light.festive },
    });
  }, [mood, livedIn, phase.kind]);
  useEffect(() => {
    // Walking hands the camera to the walker; the studio looks from outside.
    if (state.explore === "walk") dispatch({ type: "explore", view: "orbit" });
    dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "hero" } });
    return () => {
      // Closing mid-way stops the filming.
      if (latest.current.filming) latest.current.onCancel();
      latest.current.onScene(null);
    };
    // Only when the studio opens and closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The filming canvas is the live thumbnail.
  const thumb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = thumb.current,
      canvas = progress?.canvas;
    if (box && canvas && canvas.parentElement !== box) box.replaceChildren(canvas);
  }, [progress?.canvas, phase.kind]);

  const chooseMood = (next: ReelMood) => {
    setMood(next);
    if (!musicPicked) setMusic(MOOD_MUSIC[next]);
  };

  const make = async () => {
    let link = showLink && existing ? shareUrl(existing.id) : null;
    let note = "";
    if (showLink && !existing) {
      setPhase({ kind: "linking" });
      const res = await publishHome(project, homes.activeId, { showName: true, showCity: false }, capture);
      if (res.ok) link = shareUrl(res.link.id);
      else note = `${res.message} The video ends with the Dream Home address instead.`;
    }
    setPhase({ kind: "filming" });
    const outcome = await render({
      title: title.trim() || project.name,
      style,
      mood,
      music,
      livedIn,
      link,
      appUrl: globalThis.location?.origin ?? "",
    });
    if ("blob" in outcome) {
      if (!outcome.audio && music !== "none") note = [note, "This device made the video without music."].filter(Boolean).join(" ");
      return setPhase({ kind: "done", blob: outcome.blob, link, note });
    }
    if (outcome.error === "unsupported") return setPhase({ kind: "unsupported" });
    setPhase({ kind: "setup" });
    if (outcome.error === "failed") notify("Couldn’t make the video on this device. Please try again.", "error");
  };

  const fileName = `${(title.trim() || project.name).replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "dream-home"}-video.mp4`;
  const share = (blob: Blob, link: string | null) => {
    const caption = reelCaption(link);
    const file = new File([blob], fileName, { type: "video/mp4" });
    // The caption goes on the clipboard first, ready to paste into the post. No
    // waiting: phones open the share sheet only straight after a tap.
    void navigator.clipboard
      ?.writeText(caption)
      .then(() => notify("Caption copied. Paste it with your video.", "success"))
      .catch(() => undefined);
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: title || project.name, text: caption }).catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) download(blob, fileName);
      });
      return;
    }
    download(blob, fileName);
  };

  return (
    <div className="dh-photo-studio dh-reel-studio" role="dialog" aria-modal="false" aria-label="Video studio">
      <div className="dh-photo-top">
        <IconButton icon={Icon.close} label="Close video studio" onClick={onClose} />
        <strong>
          <Icon.video size={18} aria-hidden /> Video
        </strong>
      </div>
      <section className="dh-photo-panel" data-inset="bottom">
        {phase.kind === "setup" && (
          <>
            <Field label="Title">
              <input
                value={title}
                maxLength={TITLE_MAX}
                placeholder={project.name}
                onChange={(e) => setTitle(e.target.value)}
                enterKeyHint="done"
              />
            </Field>
            <Chips label="Style" value={style} options={STYLE_ORDER.map((s) => ({ value: s, label: REEL_STYLES[s].label }))} onChange={setStyle} />
            <Chips label="Mood" value={mood} options={MOOD_ORDER.map((m) => ({ value: m, label: REEL_MOODS[m].label }))} onChange={chooseMood} />
            <Chips
              label="Music"
              value={music}
              options={MUSIC_ORDER.map((m) => ({ value: m, label: REEL_MUSIC[m] }))}
              onChange={(m) => {
                setMusic(m);
                setMusicPicked(true);
              }}
            />
            <Switch
              label="Lived-in details"
              description={mood === "diwali" ? "Chai, shoes and the cat, with diyas and lights" : "Shoes at the door, chai, a sleeping cat"}
              checked={livedIn}
              onChange={() => setLivedIn(!livedIn)}
            />
            <Switch
              label="Show link at the end"
              description={
                existing
                  ? "Your home’s link and a QR code close the video"
                  : "Makes a link: anyone with it can see this home in 3D"
              }
              checked={showLink}
              onChange={() => setShowLink(!showLink)}
            />
            <Button variant="primary" size="lg" full icon={Icon.video} onClick={() => void make()}>
              Make my video
            </Button>
          </>
        )}
        {phase.kind === "linking" && (
          <div className="dh-photo-progress" role="status" aria-live="polite">
            <p>Making your link…</p>
          </div>
        )}
        {phase.kind === "filming" && (
          <div className="dh-reel-filming">
            <div className="dh-reel-thumb" ref={thumb} aria-hidden />
            <div className="dh-reel-status">
              <div role="status" aria-live="polite">
                <Ring fraction={progress?.fraction ?? 0} />
                <p>{progress?.status ?? "Getting the cameras ready…"}</p>
              </div>
              <Button variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {phase.kind === "done" && (
          <div className="dh-photo-result dh-reel-result">
            <video src={url} controls playsInline loop autoPlay muted aria-label={`Video of ${title || project.name}`} />
            {phase.note && <p className="dh-photo-note">{phase.note}</p>}
            <div className="dh-photo-actions">
              <Button variant="primary" size="lg" icon={Icon.share} onClick={() => share(phase.blob, phase.link)}>
                Share
              </Button>
              <Button variant="secondary" size="lg" icon={Icon.download} onClick={() => download(phase.blob, fileName)}>
                Save
              </Button>
            </div>
            <p className="dh-photo-note">Sharing copies a caption to paste with it: “{reelCaption(phase.link)}”</p>
            <Button variant="ghost" full icon={Icon.sparkle} onClick={() => setPhase({ kind: "setup" })}>
              Make another
            </Button>
          </div>
        )}
        {phase.kind === "unsupported" && (
          <div className="dh-reel-unsupported">
            <p>This browser can’t make videos yet. A photo of your home is the next best thing.</p>
            <Button variant="primary" size="lg" full icon={Icon.photo} onClick={onTakePhoto}>
              Take a photo instead
            </Button>
            <Button variant="ghost" full onClick={() => setPhase({ kind: "setup" })}>
              Back
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
