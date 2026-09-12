import { useEffect, useState } from "react";
import { Download, Share2, Check } from "lucide-react";
import type { Project } from "../domain/types";
import { floorName, type Language, type Unit } from "../domain/display";
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
  const [floorId, setFloorId] = useState(project.floors[0].id);
  const [prepared, setPrepared] = useState<{
    project: Project;
    unit: Unit;
    floorId: string;
    file: File;
    url: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const activeFloor = project.floors.some((floor) => floor.id === floorId)
    ? floorId
    : project.floors[0].id;
  const current =
    prepared?.project === project &&
    prepared.unit === unit &&
    prepared.floorId === activeFloor
      ? prepared
      : null;
  const file = current?.file ?? null,
    preview = current?.url ?? "";
  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    planImage(project, unit, activeFloor, controller.signal)
      .then((file) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(file);
        setPrepared({ project, unit, floorId: activeFloor, file, url });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "The image could not be prepared. Download the editable project file instead.",
          );
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [project, unit, activeFloor]);
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
            "Take the idea to your family or architect. Each floor gets a clear image with room sizes, homes and shared spaces."
          }
        </p>
        {project.floors.length > 1 && (
          <label className="select-label">
            Floor to share
            <select
              value={activeFloor}
              onChange={(event) => {
                setFloorId(event.target.value);
                setMessage("");
              }}
            >
              {project.floors.map((floor, index) => (
                <option key={floor.id} value={floor.id}>
                  {floorName(index)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="share-preview">
          {preview ? (
            <img
              src={preview}
              alt={`Preview of ${floorName(project.floors.findIndex((floor) => floor.id === activeFloor))} plan`}
            />
          ) : (
            <span>{"Preparing this floor…"}</span>
          )}
        </div>
        <div className="share-actions">
          {canShare && (
            <button className="primary-button" onClick={() => void share()}>
              <Share2 size={18} />
              {"Share this floor"}
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
            {"Download floor image"}
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
          {"Download all floors as an editable project (.json)"}
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
