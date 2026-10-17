// The Vastu card in the Home score: opt-in, then (once the homeowner says
// which way the home faces) a score and every rule with its tip. A miss may
// offer a swap with the room that sits where tradition puts it; it's only
// ever applied on a tap, and Undo takes it back.
import { useMemo } from "react";
import { Switch } from "../components/Controls";
import { COMPASS_LABEL } from "../domain/compass";
import { swapRoomUses } from "../domain/model";
import { setFacing } from "../domain/place";
import { useEditor } from "../editor/EditorProvider";
import { FacingPicker } from "./FacingPicker";
import { vastuReport, type VastuStatus } from "./vastu";
import "./insights.css";

const MARK: Record<Exclude<VastuStatus, "na">, { text: string; word: string }> = {
  pass: { text: "✓", word: "Follows Vastu" },
  partial: { text: "½", word: "Partly" },
  fail: { text: "·", word: "A tip" },
};

export function VastuCard() {
  const { project, commit, run } = useEditor();
  const report = useMemo(() => (project.vastu ? vastuReport(project, { withSwaps: true }) : null), [project]);
  const toggle = (
    <Switch
      label="Show Vastu tips"
      description="Traditional guidance, not rules."
      checked={!!project.vastu}
      onChange={() => commit({ ...project, vastu: !project.vastu }, project.vastu ? "Hide Vastu tips" : "Show Vastu tips")}
    />
  );
  if (!project.vastu)
    return (
      <section className="dh-vastu" aria-label="Vastu">
        <h3>Vastu</h3>
        {toggle}
      </section>
    );
  const names = (id: string) => project.floors.flatMap((f) => f.rooms).find((r) => r.id === id)?.name ?? "the room";
  return (
    <section className="dh-vastu" aria-label="Vastu">
      <div className="dh-vastu-score">
        <h3>Vastu</h3>
        {report && <strong className="dh-num">{report.score}/100</strong>}
      </div>
      {!report ? (
        <FacingPicker
          value={null}
          onPick={(f) =>
            run(setFacing(project, f), "Set which way the home faces", { notice: `Your home faces ${COMPASS_LABEL[f].toLowerCase()}. Vastu tips are ready.` })
          }
        />
      ) : (
        <>
          <p className="dh-vastu-note">Traditional Vastu guidance — tips, not rules.</p>
          <ul className="dh-vastu-rules">
            {report.rules
              .filter((r) => r.status !== "na")
              .map((r) => {
                const mark = MARK[r.status as Exclude<VastuStatus, "na">];
                return (
                  <li key={r.id}>
                    <span className={`dh-vastu-mark is-${r.status}`} role="img" aria-label={mark.word}>
                      {mark.text}
                    </span>
                    <b>{r.label}</b>
                    <p>{r.tip}</p>
                    {r.swap && (
                      <button
                        type="button"
                        onClick={() =>
                          run(
                            swapRoomUses(project, r.swap!.floorId, r.swap!.sourceId, r.swap!.targetId),
                            `Swap ${names(r.swap!.sourceId)} and ${names(r.swap!.targetId)}`,
                            { notice: "Swapped! Undo is always here." },
                          )
                        }
                      >
                        {r.swap.label}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </>
      )}
      {toggle}
    </section>
  );
}
