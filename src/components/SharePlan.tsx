import { useEffect, useState } from "react";
import { Download, Share2, Check } from "lucide-react";
import type { Project } from "../domain/types";
import type { Language, Unit } from "../domain/display";
import { download, planImage } from "../domain/export";
import { DialogHeading } from "./Controls";
export default function SharePlan({
  project,
  unit,
  language,
  onClose,
}: {
  project: Project;
  unit: Unit;
  language: Language;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false,
      url = "";
    planImage(project, unit)
      .then((result) => {
        if (cancelled) return;
        url = URL.createObjectURL(result);
        setFile(result);
        setPreview(url);
      })
      .catch(() => {
        if (!cancelled)
          setMessage(
            "The image could not be prepared. You can still download your project file.",
          );
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [project, unit, language]);
  const canShare =
    !!file && !!navigator.canShare && navigator.canShare({ files: [file] });
  async function share() {
    if (!file) return;
    try {
      await navigator.share({
        files: [file],
        title: "Dream-Home",
        text: "An idea for our home. Let’s talk about it.",
      });
      setMessage("Sharing completed.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setMessage(
        "Sharing was unavailable. Download the image and share it from your gallery.",
      );
    }
  }
  return (
    <>
      <DialogHeading
        title={"Share your home idea"}
        onClose={onClose}
        language={language}
      />
      <div className="share-body">
        <p className="supporting">
          {
            "Take the idea to your family or architect. The image includes every floor and room sizes."
          }
        </p>
        <div className="share-preview">
          {preview ? (
            <img src={preview} alt={"Preview of the exported home plans"} />
          ) : (
            <span>{"Preparing your floor plans…"}</span>
          )}
        </div>
        <div className="share-actions">
          {canShare && (
            <button className="primary-button" onClick={() => void share()}>
              <Share2 size={18} />
              {"Share plan"}
            </button>
          )}
          <button
            className={canShare ? "secondary-button" : "primary-button"}
            disabled={!file}
            onClick={() => {
              if (file) {
                download(file, file.name);
                setMessage(
                  "Image downloaded. Share it from your gallery or downloads.",
                );
              }
            }}
          >
            <Download size={18} />
            {"Download plan image"}
          </button>
        </div>
        {message && (
          <p className="share-message" role="status">
            <Check size={16} />
            {message}
          </p>
        )}
        <button
          className="text-link"
          onClick={() =>
            download(
              new Blob([JSON.stringify(project, null, 2)], {
                type: "application/json",
              }),
              "dream-home.json",
            )
          }
        >
          {"Download editable project file (.json)"}
        </button>
        <p className="field-note">
          {
            "No upload or account needed. Sharing opens your phone’s own share menu when supported."
          }
        </p>
      </div>
    </>
  );
}
