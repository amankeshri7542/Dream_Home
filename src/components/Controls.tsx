import { useEffect, useRef, useState, useId } from "react";
import type { ReactNode } from "react";
import { X, Minus, Plus } from "lucide-react";
import type { Language, Unit } from "../domain/display";
import { fromDisplay, toDisplay, unitLabel } from "../domain/display";

export function Dialog({
  children,
  onClose,
  wide = false,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`app-dialog ${wide ? "wide" : ""}`}
      aria-label={label}
      onCancel={onClose}
    >
      {children}
    </dialog>
  );
}
export function DialogHeading({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
  language: Language;
}) {
  return (
    <div className="sheet-heading">
      <h2>{title}</h2>
      <button
        className="round-button"
        aria-label={"Close dialog"}
        onClick={onClose}
      >
        <X size={21} />
      </button>
    </div>
  );
}
export function Dimension({
  label,
  cm,
  unit,
  onChange,
  min = 0,
  max = 10000,
  stepper = false,
}: {
  label: string;
  cm: number;
  unit: Unit;
  language: Language;
  onChange: (cm: number) => void;
  min?: number;
  max?: number;
  stepper?: boolean;
}) {
  const inputId = useId();
  const formatted = String(Number(toDisplay(cm, unit).toFixed(1)));
  const [draft, setDraft] = useState(formatted);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(formatted);
    setInvalid(false);
  }, [formatted]);
  function save() {
    // Display rounding must never invalidate an untouched exact measurement.
    if (draft === formatted) {
      setInvalid(false);
      return;
    }
    const value = fromDisplay(Number(draft), unit);
    if (draft === "" || !Number.isFinite(value) || value < min || value > max) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (draft !== formatted) onChange(value);
    setDraft(formatted);
  }
  return (
    <div className="big-field">
      <label htmlFor={inputId}>{label}</label>
      <div>
        <input
          id={inputId}
          aria-describedby={invalid ? `${inputId}-error` : undefined}
          type="number"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid}
          value={draft}
          step={unit === "ft" ? 0.5 : 0.1}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span>{unitLabel(unit)}</span>
      </div>
      {stepper && (
        <div className="dimension-steps">
          <button
            type="button"
            aria-label={`Decrease ${label.toLowerCase()}`}
            disabled={cm - (unit === "ft" ? 30 : 10) < min}
            onClick={() => onChange(cm - (unit === "ft" ? 30 : 10))}
          >
            <Minus size={20} />
            Smaller
          </button>
          <button
            type="button"
            aria-label={`Increase ${label.toLowerCase()}`}
            disabled={cm + (unit === "ft" ? 30 : 10) > max}
            onClick={() => onChange(cm + (unit === "ft" ? 30 : 10))}
          >
            <Plus size={20} />
            Bigger
          </button>
        </div>
      )}
      {invalid && (
        <small id={`${inputId}-error`} className="input-error">
          {"Enter a size within the plot."}
        </small>
      )}
    </div>
  );
}
export function Switch({
  label,
  description,
  checked,
  onChange,
  icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      className="switch-row"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      {icon}
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <i className={`toggle ${checked ? "on" : ""}`} />
    </button>
  );
}
