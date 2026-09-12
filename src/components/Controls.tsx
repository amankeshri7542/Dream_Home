import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Language, Unit } from "../domain/display";
import { fromDisplay, text, toDisplay, unitLabel } from "../domain/display";

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
  language,
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
        aria-label={text(language, "Close dialog", "बंद करें")}
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
  language,
  onChange,
  min = 0,
  max = 10000,
}: {
  label: string;
  cm: number;
  unit: Unit;
  language: Language;
  onChange: (cm: number) => void;
  min?: number;
  max?: number;
}) {
  const formatted = String(Number(toDisplay(cm, unit).toFixed(1)));
  const [draft, setDraft] = useState(formatted);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(formatted);
    setInvalid(false);
  }, [formatted]);
  function save() {
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
    <label className="big-field">
      {label}
      <div>
        <input
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
        <span>{unitLabel(unit, language)}</span>
      </div>
      {invalid && (
        <small className="input-error">
          {text(
            language,
            "Enter a size within the plot.",
            "प्लॉट के अंदर का सही माप भरें।",
          )}
        </small>
      )}
    </label>
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
