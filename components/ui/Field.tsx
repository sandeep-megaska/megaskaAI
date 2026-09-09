"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/* Shared control chrome so an input, a textarea and a select are visibly the
   same species. The old screens mixed three border colours and four radii. */
const CONTROL =
  "w-full rounded-xl border border-line bg-well text-ink placeholder:text-ink-3 transition-colors " +
  "hover:border-line-strong focus:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50";

type FieldShellProps = {
  label: string;
  /** Marks the control required, both visually and for assistive tech. */
  required?: boolean;
  /** Persistent guidance shown under the label. */
  hint?: ReactNode;
  /** Validation message. Replaces the hint and colours the control. */
  error?: string | null;
  /** Right-aligned adornment on the label row (a counter, a "clear" link). */
  action?: ReactNode;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
};

/**
 * Label + control + hint/error, wired together with real `htmlFor` /
 * `aria-describedby` / `aria-invalid` so the guidance reaches screen readers
 * instead of only sighted users.
 */
export function Field({ label, required, hint, error, action, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-1 text-accent" aria-hidden>
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
        {action}
      </div>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> &
  Omit<FieldShellProps, "children"> & {
    /** Shows a live `used / max` counter on the label row. */
    maxLength?: number;
    value: string;
  };

export function TextAreaField({
  label,
  required,
  hint,
  error,
  action,
  className,
  maxLength,
  value,
  ...rest
}: TextAreaFieldProps) {
  const counter =
    typeof maxLength === "number" ? (
      <span
        className={cn(
          "text-xs tabular-nums",
          value.length > maxLength * 0.9 ? "text-warning" : "text-ink-3",
        )}
      >
        {value.length}/{maxLength}
      </span>
    ) : null;

  return (
    <Field
      label={label}
      required={required}
      hint={hint}
      error={error}
      action={action ?? counter}
      className={className}
    >
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          value={value}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(CONTROL, "min-h-28 resize-y px-3 py-2.5 text-sm leading-relaxed", invalid && "border-danger/60")}
          {...rest}
        />
      )}
    </Field>
  );
}

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> &
  Omit<FieldShellProps, "children">;

export function SelectField({ label, required, hint, error, action, className, children, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} required={required} hint={hint} error={error} action={action} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(
              CONTROL,
              "h-10 appearance-none px-3 pr-9 text-sm",
              invalid && "border-danger/60",
            )}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
        </div>
      )}
    </Field>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> &
  Omit<FieldShellProps, "children">;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, required, hint, error, action, className, ...rest },
  ref,
) {
  return (
    <Field label={label} required={required} hint={hint} error={error} action={action} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(CONTROL, "h-10 px-3 text-sm", invalid && "border-danger/60")}
          {...rest}
        />
      )}
    </Field>
  );
});
