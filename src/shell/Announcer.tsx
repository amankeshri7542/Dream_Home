import { useEffect, useRef, useState } from "react";
import { area, areaLabel, length, unitLabel } from "../domain/display";
import { useEditor } from "../editor/EditorProvider";

/** Politely tells screen-reader users what is selected and what they can do. */
export function SelectionAnnouncer() {
  const { selected, unit, state } = useEditor();
  const [text, setText] = useState("");
  const last = useRef("");
  useEffect(() => {
    if (!selected) {
      last.current = "";
      return;
    }
    const key = `${selected.target.kind}:${selected.target.id}`;
    if (key === last.current) return;
    last.current = key;
    const b = selected.bounds ?? selected.room?.bounds;
    const size = b
      ? ` ${length(b.w, unit)} by ${length(b.d, unit)} ${unitLabel(unit) === "ft" ? "feet" : "metres"}, about ${area((b.w * b.d) / 10000, unit)} ${areaLabel(unit)}.`
      : "";
    setText(
      `${selected.name} selected.${size} ${state.mode === "build" ? "Move, resize and more are in the actions bar." : "Its options are in the details panel."}`,
    );
  }, [selected, unit, state.mode]);
  return (
    <div className="dh-visually-hidden" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
