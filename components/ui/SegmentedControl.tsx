"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** One line explaining what picking this does. */
  description?: string;
  disabled?: boolean;
  /** Shown when a disabled option needs to say why. */
  disabledReason?: string;
  icon?: ReactNode;
};

/**
 * A small set of mutually exclusive modes, as a real radio group: arrow keys
 * move between options and only the active one is in the tab order. Previously
 * these were loose `<button>`s that read to a screen reader as unrelated
 * controls with no indication of which was on.
 */
export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  columns,
  className,
}: {
  /** Accessible name for the group. Rendered visually unless `hideLabel`. */
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  /** Force a column count; defaults to one column per option. */
  columns?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  function focusOption(index: number) {
    const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>("[data-segment]");
    buttons?.[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const enabled = options.map((option, i) => ({ option, i })).filter((entry) => !entry.option.disabled);
    if (!enabled.length) return;

    const position = enabled.findIndex((entry) => entry.i === index);
    let next: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = enabled[(position + 1) % enabled.length].i;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = enabled[(position - 1 + enabled.length) % enabled.length].i;
    } else if (event.key === "Home") {
      next = enabled[0].i;
    } else if (event.key === "End") {
      next = enabled[enabled.length - 1].i;
    }

    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    focusOption(next);
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            data-segment
            type="button"
            role="radio"
            aria-checked={selected}
            aria-describedby={option.disabled && option.disabledReason ? `${option.value}-reason` : undefined}
            disabled={option.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            title={option.disabled ? option.disabledReason : undefined}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-40",
              selected
                ? "border-accent/60 bg-accent/10 text-ink"
                : "border-line bg-well text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {option.icon}
              {option.label}
            </span>
            {option.description ? (
              <span className="text-[11px] leading-snug text-ink-3">{option.description}</span>
            ) : null}
            {option.disabled && option.disabledReason ? (
              <span id={`${option.value}-reason`} className="sr-only">
                {option.disabledReason}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
