import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import type { LucideIcon } from "./icons";
import "./primitives.css";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    icon?: LucideIcon;
    full?: boolean;
    size?: "md" | "lg";
  }
>(function Button(
  { variant = "secondary", icon: IconGlyph, full, size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`dh-btn dh-btn-${variant} dh-btn-${size} ${full ? "dh-btn-full" : ""} ${className ?? ""}`}
      {...rest}
    >
      {IconGlyph && <IconGlyph size={size === "lg" ? 20 : 18} aria-hidden />}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: LucideIcon;
    label: string;
    tone?: "glass" | "plain" | "hud";
    pressed?: boolean;
  }
>(function IconButton(
  { icon: IconGlyph, label, tone = "glass", pressed, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`dh-icon-btn dh-icon-btn-${tone} ${className ?? ""}`}
      {...rest}
    >
      <IconGlyph size={20} aria-hidden />
    </button>
  );
});

/** A labelled tool button: icon over a short caption (palette, docks, mode bar). */
export const ToolButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: LucideIcon;
    label: string;
    caption?: string;
    pressed?: boolean;
    badge?: number;
  }
>(function ToolButton(
  { icon: IconGlyph, label, caption, pressed, badge, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      // A short caption ("More") keeps the full name ("More actions") for screen readers.
      aria-label={caption && caption !== label ? label : undefined}
      className={`dh-tool ${className ?? ""}`}
      {...rest}
    >
      <span className="dh-tool-icon">
        <IconGlyph size={22} aria-hidden />
        {!!badge && <i className="dh-badge">{badge}</i>}
      </span>
      <span className="dh-tool-label">{caption ?? label}</span>
    </button>
  );
});

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="dh-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <o.icon size={17} aria-hidden />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Swatches<T extends string>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; color: string; pattern?: string }[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  const id = useId();
  return (
    <fieldset className="dh-swatches">
      <legend id={id}>{label}</legend>
      <div
        role="radiogroup"
        aria-labelledby={id}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.value)}
          >
            <i style={{ background: o.pattern ?? o.color }} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Section({
  title,
  children,
  open = false,
  description,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
  description?: string;
}) {
  return (
    <details className="dh-section" open={open}>
      <summary>
        <span>
          <strong>{title}</strong>
          {description && <small>{description}</small>}
        </span>
      </summary>
      <div className="dh-section-body">{children}</div>
    </details>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="dh-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="dh-kbd">{children}</kbd>;
}
