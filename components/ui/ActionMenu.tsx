"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders the item in the danger hue and separates it from the rest. */
  destructive?: boolean;
};

/**
 * Overflow menu for a card's secondary actions.
 *
 * Gallery cards previously carried up to eight equal-weight buttons, which made
 * every card an unreadable wall. One primary action stays on the card; the rest
 * live here, reachable by keyboard (arrows, Home/End, Escape) and closed on
 * outside click.
 */
export default function ActionMenu({
  items,
  label = "More actions",
  align = "end",
}: {
  items: ActionMenuItem[];
  label?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("[data-menu-trigger]")?.focus();
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[data-menu-item]") ?? []).filter(
        (element) => !element.disabled,
      );
      if (!options.length) return;

      event.preventDefault();
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Home") options[0].focus();
      else if (event.key === "End") options[options.length - 1].focus();
      else if (event.key === "ArrowDown") options[(index + 1) % options.length].focus();
      else options[(index - 1 + options.length) % options.length].focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("[data-menu-item]")?.focus(), 0);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        data-menu-trigger
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong text-ink-2 transition-colors",
          "hover:bg-raised hover:text-ink",
          open && "bg-raised text-ink",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-30 mt-1.5 min-w-52 overflow-hidden rounded-xl border border-line bg-raised py-1 shadow-overlay",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              data-menu-item
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-40",
                item.destructive
                  ? "mt-1 border-t border-line text-danger hover:bg-danger/10"
                  : "text-ink-2 hover:bg-surface hover:text-ink",
              )}
            >
              {item.icon ? <span className="shrink-0 opacity-80">{item.icon}</span> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
