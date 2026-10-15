import { Dimension, Switch } from "../../components/Controls";
import {
  FENCE_STYLES,
  LANDSCAPE_CATALOG,
  landscapeCatalogItem,
  landscapeLabel,
  resolveLandscape,
} from "../../domain/landscape";
import {
  addLandscape,
  duplicateLandscape,
  moveLandscape,
  removeLandscape,
  resetLandscape,
  resizeLandscape,
  rotateLandscape,
  updateLandscape,
} from "../../domain/landscapeCommands";
import {
  STYLE_PRESET_INFO,
  applyStylePreset,
  setStyleDetails,
  styleDetails,
  DOOR_COLORS,
  EXTERIOR_FINISHES,
  GROUND_STYLES,
  ROOF_MATERIALS,
  ROOF_STYLES,
  TRIM_COLORS,
  effectiveRoof,
  exteriorFinish,
  frontDoorColor,
  hasCourtyard,
  setExterior,
  setGarden,
  setParking,
  setSite,
  setStyle,
  siteGround,
  trimColor,
} from "../../domain/materials";
import type { EditResult, RailingKind, RoofStyle, StylePreset } from "../../domain/types";
import { useEditor } from "../../editor/EditorProvider";
import { Icon } from "../../ui/icons";
import { Button, IconButton, Section, Segmented, Swatches } from "../../ui/primitives";
import { Thumb } from "./DecoratePanels";
import "./outside.css";

const swatches = <T extends Record<string, { label: string; color: string }>>(set: T) =>
  Object.entries(set).map(([value, s]) => ({ value, label: s.label, color: s.color }));

function RoofIcon({ style }: { style: RoofStyle }) {
  const path =
    style === "gable"
      ? "M4 30 L24 10 L44 30 Z"
      : style === "hip"
        ? "M4 30 L16 12 L32 12 L44 30 Z"
        : style === "shed"
          ? "M4 30 L4 16 L44 8 L44 30 Z"
          : "M4 30 L4 20 L44 20 L44 30 Z";
  return (
    <svg viewBox="0 0 48 40" width="56" height="44" aria-hidden>
      <path d={path} fill="var(--dh-terracotta-600)" />
      <rect x="9" y="29" width="30" height="9" fill="var(--dh-paper-3)" />
    </svg>
  );
}

/** A tiny house in the look's colours: flat roof + tank, or a gable. */
function LookIcon({ preset }: { preset: StylePreset }) {
  const [wall, trim, accent] = STYLE_PRESET_INFO[preset].colors;
  const indian = preset !== "diorama";
  return (
    <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden>
      <rect x="0" y="54" width="96" height="10" rx="3" fill="#9fb07a" />
      {indian ? (
        <>
          <rect x="62" y="10" width="14" height="12" rx="3" fill="#2d2b29" />
          <rect x="64" y="22" width="2" height="5" fill="#2d2b29" />
          <rect x="72" y="22" width="2" height="5" fill="#2d2b29" />
          <rect x="18" y="26" width="60" height="30" fill={wall} />
          <rect x="16" y="24" width="64" height="5" fill={trim} />
          <rect x="24" y="33" width="14" height="10" fill="#6d8794" />
          <rect x="22" y="31" width="18" height="3" fill="#d9d4ca" />
          <rect x="56" y="33" width="14" height="10" fill="#6d8794" />
          <rect x="54" y="31" width="18" height="3" fill="#d9d4ca" />
          <rect x="43" y="40" width="10" height="16" fill={accent} />
          <rect x="4" y="47" width="88" height="8" fill="#efe9de" />
          <rect x="40" y="47" width="16" height="8" fill="#9fb07a" />
        </>
      ) : (
        <>
          <path d="M14 30 L48 8 L82 30 Z" fill={trim} />
          <rect x="20" y="30" width="56" height="26" fill={wall} />
          <rect x="27" y="36" width="12" height="9" fill="#6d8794" />
          <rect x="57" y="36" width="12" height="9" fill="#6d8794" />
          <rect x="43" y="40" width="10" height="16" fill={accent} />
        </>
      )}
    </svg>
  );
}

function LookRow() {
  const { project, run } = useEditor();
  const current = project.style?.preset;
  return (
    <fieldset className="dh-looks">
      <legend>Look</legend>
      {(Object.keys(STYLE_PRESET_INFO) as StylePreset[]).map((preset) => {
        const info = STYLE_PRESET_INFO[preset];
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={current === preset}
            aria-describedby={`dh-look-${preset}`}
            onClick={() => run(applyStylePreset(project, preset), `Use the ${info.label} look`, { notice: `${info.label} look` })}
          >
            <LookIcon preset={preset} />
            <strong>{info.label}</strong>
            <small id={`dh-look-${preset}`}>{info.description}</small>
          </button>
        );
      })}
    </fieldset>
  );
}

function DetailsSection() {
  const { project, run } = useEditor();
  const details = styleDetails(project);
  const flat = effectiveRoof(project).style === "flat";
  const toggle = (key: "chhajja" | "waterTank" | "carPorch", label: string) =>
    run(setStyleDetails(project, { [key]: !details[key] }), label);
  return (
    <div className="dh-style-details">
      <Switch
        label="Sunshades (chhajja)"
        description="A concrete ledge over every outside window and door"
        checked={details.chhajja}
        onChange={() => toggle("chhajja", "Toggle sunshades")}
      />
      <Switch
        label="Water tank on the roof"
        description={flat ? "A black tank and a stair cabin on the terrace" : "Shows with a flat roof"}
        checked={details.waterTank}
        onChange={() => toggle("waterTank", "Toggle the water tank")}
      />
      <Switch
        label="Car porch"
        description={project.parking ? "A slim canopy over the parking spot" : "Shows when the home has parking"}
        checked={details.carPorch}
        onChange={() => toggle("carPorch", "Toggle the car porch")}
      />
      <Segmented<RailingKind>
        label="Balcony railing"
        value={details.railing}
        options={[
          { value: "glass", label: "Glass" },
          { value: "grille", label: "Grille" },
          { value: "jaali", label: "Jaali" },
        ]}
        onChange={(railing) => run(setStyleDetails(project, { railing }), "Change balcony railing")}
      />
    </div>
  );
}

export function StylePanel() {
  const { project, run } = useEditor();
  const roof = effectiveRoof(project);
  const courtyard = hasCourtyard(project);
  const setRoof = (patch: Partial<typeof roof>, label: string) =>
    run(setStyle(project, { roof: { ...roof, ...patch } }), label, { coalesceKey: "roof" });
  return (
    <div className="dh-inspector-body">
      <LookRow />
      <DetailsSection />
      <Swatches
        label="Outside walls"
        value={exteriorFinish(project)}
        options={swatches(EXTERIOR_FINISHES)}
        onChange={(id) =>
          run(setExterior(project, id), `Use ${EXTERIOR_FINISHES[id as keyof typeof EXTERIOR_FINISHES].label.toLowerCase()} outside`, {
            coalesceKey: "exterior",
          })
        }
      />
      <fieldset className="dh-roof-styles">
        <legend>Roof</legend>
        {(Object.keys(ROOF_STYLES) as RoofStyle[]).map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={roof.style === style}
            disabled={courtyard && style !== "flat"}
            onClick={() =>
              setRoof(
                {
                  style,
                  material: style === "flat" ? "membrane" : roof.material === "membrane" ? "terracotta" : roof.material,
                },
                `Choose a ${ROOF_STYLES[style].label.toLowerCase()} roof`,
              )
            }
          >
            <RoofIcon style={style} />
            {ROOF_STYLES[style].label}
          </button>
        ))}
      </fieldset>
      {courtyard && (
        <p className="dh-note">
          Homes with an open courtyard keep a flat roof so the sky can pour in.
        </p>
      )}
      {roof.style !== "flat" && (
        <>
          <Swatches
            label="Roof material"
            value={roof.material}
            options={swatches(ROOF_MATERIALS).filter((o) => o.value !== "membrane")}
            onChange={(material) => setRoof({ material: material as typeof roof.material }, "Change roof material")}
          />
          <Segmented
            label="Roof steepness"
            value={String(roof.pitch) as "20" | "30" | "40"}
            options={[
              { value: "20", label: "Gentle" },
              { value: "30", label: "Classic" },
              { value: "40", label: "Steep" },
            ]}
            onChange={(pitch) => setRoof({ pitch: Number(pitch) as 20 | 30 | 40 }, "Change roof steepness")}
          />
        </>
      )}
      <Swatches
        label="Window frames & trim"
        value={trimColor(project)}
        options={swatches(TRIM_COLORS)}
        onChange={(trim) => run(setStyle(project, { trim }), "Change trim colour", { coalesceKey: "trim" })}
      />
      <Swatches
        label="Front door"
        value={frontDoorColor(project)}
        options={swatches(DOOR_COLORS)}
        onChange={(frontDoor) =>
          run(setStyle(project, { frontDoor }), "Paint the front door", { coalesceKey: "door" })
        }
      />
    </div>
  );
}

function useLandscapeRun() {
  const editor = useEditor();
  return (result: EditResult, label: string, notice?: string) =>
    editor.run(result, label, {
      select: result.ok && result.focusId ? { kind: "landscape", id: result.focusId } : undefined,
      quietError: true,
      ...(notice ? { notice } : {}),
    });
}

export function GardenPanel() {
  const editor = useEditor();
  const { project, select, run } = editor;
  const add = useLandscapeRun();
  const items = resolveLandscape(project);
  return (
    <div className="dh-inspector-body">
      <p className="dh-lead">Tap something to plant it in a free spot, then nudge it where you like.</p>
      <div className="dh-catalog-grid">
        {LANDSCAPE_CATALOG.map((item) => (
          <button
            key={item.id}
            type="button"
            className="dh-catalog-card"
            aria-label={`Add ${item.label.toLowerCase()} to the garden`}
            onClick={() =>
              add(addLandscape(project, item.id), `Add ${item.label.toLowerCase()}`, `${item.label} added!`)
            }
          >
            <Thumb id={item.id} label={item.label} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <Section title="In your garden" description={`${items.length} thing${items.length === 1 ? "" : "s"}`}>
        <div className="dh-furniture-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="dh-furniture-chip"
              onClick={() => select({ kind: "landscape", id: item.id }, "list")}
            >
              <Thumb id={item.kind} label={landscapeLabel(item.kind)} />
              <span>{landscapeLabel(item.kind)}</span>
            </button>
          ))}
        </div>
        {project.landscape && (
          <Button
            variant="ghost"
            icon={Icon.auto}
            onClick={() =>
              run(resetLandscape(project), "Automatic garden", {
                select: null,
                notice: "The garden is automatic again.",
              })
            }
          >
            Make the garden automatic again
          </Button>
        )}
      </Section>
    </div>
  );
}

export function SitePanel() {
  const { project, run } = useEditor();
  return (
    <div className="dh-inspector-body">
      <Swatches
        label="Ground"
        value={siteGround(project)}
        options={swatches(GROUND_STYLES)}
        onChange={(ground) => run(setSite(project, { ground }), "Change the ground", { coalesceKey: "ground" })}
      />
      <fieldset className="dh-fences">
        <legend>Boundary</legend>
        {Object.entries(FENCE_STYLES).map(([id, fence]) => (
          <button
            key={id}
            type="button"
            aria-pressed={(project.site?.fence ?? "none") === id}
            onClick={() => run(setSite(project, { fence: id === "none" ? null : id }), `Choose ${fence.label.toLowerCase()}`)}
          >
            <i style={{ background: fence.color ?? "transparent" }} />
            {fence.label}
          </button>
        ))}
      </fieldset>
      <Switch
        label="Garden & green space"
        description="Trees and a lawn around the home"
        checked={project.garden}
        onChange={() => run(setGarden(project, !project.garden), "Toggle garden")}
      />
      <Switch
        label="Open parking"
        description="A car spot where one fits outside"
        checked={project.parking}
        onChange={() => run(setParking(project, !project.parking), "Toggle parking", { quietError: true })}
      />
    </div>
  );
}

export function LandscapeInspector() {
  const editor = useEditor();
  const { project, selected, unit, run } = editor;
  const edit = useLandscapeRun();
  const item = selected?.landscape;
  if (!item) return null;
  const entry = landscapeCatalogItem(item.kind);
  const label = landscapeLabel(item.kind);
  const nudge = (dx: number, dz: number) =>
    edit(moveLandscape(project, item.id, { x: item.x + dx, z: item.z + dz }), `Move ${label.toLowerCase()}`);
  return (
    <div className="dh-inspector-body">
      <div className="dh-furniture-hero">
        <Thumb id={item.kind} label={label} />
        <p className="dh-note">
          {item.id.startsWith("auto:")
            ? "Planted automatically — change it and the garden becomes yours."
            : "In your garden"}
        </p>
      </div>
      <div className="dh-nudge" role="group" aria-label="Move a little">
        <span>
          <strong>Move a little</strong>
          <small>50 cm each tap</small>
        </span>
        <div>
          <IconButton icon={Icon.left} label="Move left" onClick={() => nudge(-50, 0)} />
          <IconButton icon={Icon.up} label="Move back" onClick={() => nudge(0, -50)} />
          <IconButton icon={Icon.down} label="Move forward" onClick={() => nudge(0, 50)} />
          <IconButton icon={Icon.right} label="Move right" onClick={() => nudge(50, 0)} />
        </div>
      </div>
      <div className="dh-cluster">
        {entry?.rotatable && (
          <Button icon={Icon.rotate} onClick={() => edit(rotateLandscape(project, item.id, 1), `Turn ${label.toLowerCase()}`)}>
            Turn
          </Button>
        )}
        <Button icon={Icon.duplicate} onClick={() => edit(duplicateLandscape(project, item.id), `Copy ${label.toLowerCase()}`, `Another ${label.toLowerCase()}!`)}>
          Copy
        </Button>
      </div>
      {entry?.variants && entry.variants.length > 1 && (
        <Segmented
          label={item.kind.startsWith("tree") ? "Size" : "Colour"}
          value={item.variant ?? entry.variants[Math.floor(entry.variants.length / 2)]}
          options={entry.variants.map((v) => ({
            value: v,
            label: v === "s" ? "Small" : v === "m" ? "Medium" : v === "l" ? "Large" : v[0].toUpperCase() + v.slice(1),
          }))}
          onChange={(variant) => edit(updateLandscape(project, item.id, { variant }), `Change ${label.toLowerCase()}`)}
        />
      )}
      {entry?.resizable && (
        <div className="field-pair">
          <Dimension
            label="Width"
            cm={item.w ?? entry.footprint.w}
            unit={unit}
            language="en"
            min={entry.resizable.w[0]}
            max={entry.resizable.w[1]}
            stepper
            onChange={(w) => edit(resizeLandscape(project, item.id, { w }), `Resize ${label.toLowerCase()}`)}
          />
          <Dimension
            label="Length"
            cm={item.d ?? entry.footprint.d}
            unit={unit}
            language="en"
            min={entry.resizable.d[0]}
            max={entry.resizable.d[1]}
            stepper
            onChange={(d) => edit(resizeLandscape(project, item.id, { d }), `Resize ${label.toLowerCase()}`)}
          />
        </div>
      )}
      <div className="dh-danger-zone">
        <Button
          variant="danger"
          icon={Icon.remove}
          onClick={() =>
            run(removeLandscape(project, item.id), `Remove ${label.toLowerCase()}`, {
              select: null,
              notice: `${label} removed. Undo brings it back.`,
            })
          }
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
