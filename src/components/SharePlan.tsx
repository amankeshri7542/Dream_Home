import { useEffect, useState } from "react";
import { Download, Share2, Check } from "lucide-react";
import type { Project } from "../domain/types";
import type { Language, Unit } from "../domain/display";
import { text } from "../domain/display";
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
  const t = (en: string, hi: string) => text(language, en, hi);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false,
      url = "";
    planImage(project, unit, language)
      .then((result) => {
        if (cancelled) return;
        url = URL.createObjectURL(result);
        setFile(result);
        setPreview(url);
      })
      .catch(() => {
        if (!cancelled)
          setMessage(
            text(
              language,
              "The image could not be prepared. You can still download your project file.",
              "चित्र नहीं बन पाया। आप प्रोजेक्ट फ़ाइल डाउनलोड कर सकते हैं।",
            ),
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
        text: t(
          "An idea for our home. Let’s talk about it.",
          "हमारे घर का एक विचार। इस पर बात करें।",
        ),
      });
      setMessage(t("Sharing completed.", "शेयर हो गया।"));
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setMessage(
        t(
          "Sharing was unavailable. Download the image and share it from your gallery.",
          "अभी शेयर नहीं हो पाया। चित्र डाउनलोड करके गैलरी से शेयर करें।",
        ),
      );
    }
  }
  return (
    <>
      <DialogHeading
        title={t(
          "A naksha worth talking about.",
          "एक नक्शा, परिवार के साथ चर्चा के लिए।",
        )}
        onClose={onClose}
        language={language}
      />
      <div className="share-body">
        <p className="supporting">
          {t(
            "Take the idea to your family or architect. The image includes every floor and room sizes.",
            "परिवार या आर्किटेक्ट को अपना विचार दिखाएँ। चित्र में हर मंज़िल और कमरों के माप हैं।",
          )}
        </p>
        <div className="share-preview">
          {preview ? (
            <img
              src={preview}
              alt={t(
                "Preview of the exported home plans",
                "घर के नक्शों का प्रीव्यू",
              )}
            />
          ) : (
            <span>
              {t("Preparing your floor plans…", "आपके नक्शे तैयार हो रहे हैं…")}
            </span>
          )}
        </div>
        <div className="share-actions">
          {canShare && (
            <button className="primary-button" onClick={() => void share()}>
              <Share2 size={18} />
              {t("Share plan", "नक्शा शेयर करें")}
            </button>
          )}
          <button
            className={canShare ? "secondary-button" : "primary-button"}
            disabled={!file}
            onClick={() => {
              if (file) {
                download(file, file.name);
                setMessage(
                  t(
                    "Image downloaded. Share it from your gallery or downloads.",
                    "चित्र डाउनलोड हो गया। गैलरी या डाउनलोड से शेयर करें।",
                  ),
                );
              }
            }}
          >
            <Download size={18} />
            {t("Download plan image", "नक्शे का चित्र डाउनलोड करें")}
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
          {t(
            "Download editable project file (.json)",
            "बदलाव के लिए प्रोजेक्ट फ़ाइल डाउनलोड करें (.json)",
          )}
        </button>
        <p className="field-note">
          {t(
            "No upload or account needed. Sharing opens your phone’s own share menu when supported.",
            "अपलोड या खाते की ज़रूरत नहीं। समर्थित फ़ोन पर उसका अपना शेयर मेन्यू खुलेगा।",
          )}
        </p>
      </div>
    </>
  );
}
