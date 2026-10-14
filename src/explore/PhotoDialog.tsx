import { useEffect, useMemo } from "react";
import { Dialog, DialogHeading } from "../components/Controls";
import { download } from "../domain/export";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";

export function PhotoDialog({
  blob,
  name,
  onClose,
}: {
  blob: Blob;
  name: string;
  onClose: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "dream-home"}-${date}.png`;
  const file = new File([blob], fileName, { type: "image/png" });
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (navigator.canShare?.({ files: [file] }) ?? false);
  return (
    <Dialog label="Your photo" onClose={onClose}>
      <DialogHeading title="What a view!" language="en" onClose={onClose} />
      <div className="dh-photo">
        <img src={url} alt={`Photo of ${name}`} />
        <div className="dh-photo-actions">
          <Button variant="primary" icon={Icon.download} onClick={() => download(blob, fileName)}>
            Save photo
          </Button>
          {canShare && (
            <Button
              variant="secondary"
              icon={Icon.share}
              onClick={() => void navigator.share({ files: [file], title: name }).catch(() => undefined)}
            >
              Share photo
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
