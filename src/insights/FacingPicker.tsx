// "Which way does your main door face?": a little compass rose of eight
// big buttons around the house. It sets true north for the sun and Vastu.
import { COMPASS_LABEL, COMPASS_SHORT, type Compass8 } from "../domain/compass";
import { Icon } from "../ui/icons";
import "./insights.css";

/** The rose, row by row; null is the house in the middle. */
const ROSE: (Compass8 | null)[] = ["northwest", "north", "northeast", "west", null, "east", "southwest", "south", "southeast"];

export function FacingPicker({
  value,
  onPick,
  question = "Which way does your main door face?",
}: {
  value: Compass8 | null;
  onPick: (facing: Compass8) => void;
  question?: string;
}) {
  return (
    <div className="dh-facing">
      <span id="dh-facing-q">{question}</span>
      <div className="dh-facing-rose" role="radiogroup" aria-labelledby="dh-facing-q">
        {ROSE.map((dir, i) =>
          dir ? (
            <button
              key={dir}
              type="button"
              role="radio"
              aria-checked={value === dir}
              aria-label={COMPASS_LABEL[dir]}
              onClick={() => onPick(dir)}
            >
              {COMPASS_SHORT[dir]}
            </button>
          ) : (
            <span key={i} className="dh-facing-home" aria-hidden>
              <Icon.home size={22} />
            </span>
          ),
        )}
      </div>
      <small>Stand at your main door, looking out. A phone compass helps.</small>
    </div>
  );
}
