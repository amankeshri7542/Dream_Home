// "Sunlight": move the sun through the day (and the seasons) and see which
// rooms catch it. The 3D view follows the slider (a frame per change, never
// an animation loop); each room gets a plain phrase, and hot or dark rooms a
// tip with a one-tap fix where there is one. Lazy (its own chunk).
import { useEffect, useMemo, useRef, useState } from "react";
import { COMPASS_LABEL, homeFacing } from "../domain/compass";
import { addFurniture } from "../domain/furnitureCommands";
import { setStyleDetails } from "../domain/materials";
import { setFacing, setLocation } from "../domain/place";
import { useEditor } from "../editor/EditorProvider";
import { Chips } from "../photo/PhotoStudio";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { CityPicker } from "./CityPicker";
import { FacingPicker } from "./FacingPicker";
import { CENTRAL_INDIA } from "./score";
import { SEASONS, SEASON_ORDER, clockLabel, seasonDate, sunTimes } from "./solar";
import { sunHours, sunTips, type SunFix } from "./sun";
import "../photo/photo.css";
import "./insights.css";

const FIRST = 6,
  LAST = 19;

export default function SunlightSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch, project, run, activeFloor } = useEditor();
  const location = project.plot.location;
  const place = location ?? CENTRAL_INDIA;
  const date = useMemo(() => seasonDate(state.season), [state.season]);
  const [floorId, setFloorId] = useState(state.focus?.floorId ?? activeFloor.id);
  const floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
  const rooms = useMemo(() => sunHours(project, floor.id, place, date), [project, floor.id, place, date]);
  const tips = useMemo(() => sunTips(project, rooms), [project, rooms]);
  const times = useMemo(() => sunTimes(place, date), [place, date]);
  const here = state.focus?.roomId;
  const ordered = useMemo(() => [...rooms].sort((a, b) => Number(b.roomId === here) - Number(a.roomId === here)), [rooms, here]);

  // Start at a sunny morning hour, and put the editor's hour back on closing.
  const before = useRef(state.hour);
  useEffect(() => {
    const start = before.current;
    if (start < FIRST || start > LAST) dispatch({ type: "hour", hour: 9 });
    return () => dispatch({ type: "hour", hour: start });
  }, [dispatch]);
  const hour = Math.min(LAST, Math.max(FIRST, state.hour));
  const setHour = (h: number) => dispatch({ type: "hour", hour: Math.min(LAST, Math.max(FIRST, h)) });

  const fix = (f: SunFix, roomName: string) => {
    if (f.kind === "curtains") run(addFurniture(project, f.floorId, f.roomId, "curtains"), `Add curtains to ${roomName}`, { notice: "Curtains up! Undo is always here." });
    else run(setStyleDetails(project, { chhajja: true }), "Add sunshades", { notice: "Sunshades (chhajja) over the windows." });
  };
  const facing = homeFacing(project);

  return (
    <div className="dh-sun-sheet" role="dialog" aria-modal="false" aria-label="Sunlight">
      <section className="dh-sun-panel" data-inset="bottom">
        <div className="dh-sun-head">
          <h2>
            <Icon.sunlight size={20} aria-hidden /> Sunlight
          </h2>
          <IconButton icon={Icon.close} tone="plain" label="Close sunlight" onClick={onClose} />
        </div>
        {location ? (
          <p className="dh-sun-where">
            The real sun in {location.city}
            {facing ? `, your home facing ${COMPASS_LABEL[facing].toLowerCase()}` : ""}.
          </p>
        ) : (
          <>
            <p className="dh-sun-where">Showing the sun for central India. Pick your city for your own.</p>
            <CityPicker
              onPick={(l) => l && run(setLocation(project, l), `Set the city to ${l.city}`, { notice: `The sun now follows ${l.city}.` })}
              label="Your city"
            />
          </>
        )}
        {!facing && (
          <FacingPicker
            value={null}
            onPick={(f) => run(setFacing(project, f), "Set which way the home faces", { notice: `Your home faces ${COMPASS_LABEL[f].toLowerCase()}.` })}
          />
        )}
        <Chips
          label="Season"
          value={state.season}
          options={SEASON_ORDER.map((s) => ({ value: s, label: SEASONS[s].label }))}
          onChange={(season) => dispatch({ type: "season", season })}
        />
        <div className="dh-sun-time">
          <div className="dh-sun-time-row">
            <strong className="dh-num" aria-live="polite">
              {clockLabel(hour)}
            </strong>
            <small>
              {times.sunrise !== null && `Sunrise ${clockLabel(times.sunrise)}`}
              {times.sunset !== null && ` · Sunset ${clockLabel(times.sunset)}`}
            </small>
          </div>
          <input
            type="range"
            min={FIRST}
            max={LAST}
            step={0.25}
            value={hour}
            aria-label="Time of day"
            aria-valuetext={clockLabel(hour)}
            onChange={(e) => setHour(Number(e.target.value))}
          />
          <div className="dh-photo-chips">
            {times.sunrise !== null && (
              <button type="button" onClick={() => setHour(Math.ceil(times.sunrise! * 4) / 4 + 0.25)}>
                Sunrise
              </button>
            )}
            <button type="button" onClick={() => setHour(Math.round(times.noon * 4) / 4)}>
              Noon
            </button>
            {times.sunset !== null && (
              <button type="button" onClick={() => setHour(Math.floor(times.sunset! * 4) / 4 - 0.25)}>
                Sunset
              </button>
            )}
          </div>
        </div>
        {project.floors.length > 1 && (
          <Chips label="Floor" value={floor.id} options={project.floors.map((f) => ({ value: f.id, label: f.name }))} onChange={setFloorId} />
        )}
        <h3>
          Direct sun {state.season === "today" ? "today" : `in ${SEASONS[state.season].label.toLowerCase()}`}
        </h3>
        <ul className="dh-sun-rooms">
          {ordered.map((r) => (
            <li key={r.roomId} className={r.roomId === here ? "is-here" : undefined}>
              <strong>{r.name}</strong>
              <small>{r.hours ? `${r.hours} h` : ""}</small>
              <span>{r.windows ? r.phrase : "No outside window"}</span>
            </li>
          ))}
        </ul>
        {tips.length > 0 && (
          <>
            <h3>Tips</h3>
            <ul className="dh-sun-tips">
              {tips.map((t) => (
                <li key={t.roomId}>
                  <Icon.sunlight size={18} aria-hidden />
                  <span>{t.text}</span>
                  {t.fix && (
                    <button type="button" onClick={() => fix(t.fix!, rooms.find((r) => r.roomId === t.roomId)?.name ?? "the room")}>
                      {t.fix.kind === "curtains" ? "Add curtains" : "Add sunshades"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="dh-vastu-note">Walls and neighbours can shade a window too; the shadows in the view show them.</p>
        <Button variant="ghost" full onClick={onClose}>
          Done
        </Button>
      </section>
    </div>
  );
}
