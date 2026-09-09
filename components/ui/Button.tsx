"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Exactly one `primary` per view. Everything else is `secondary` or `ghost` —
 * the previous screens gave a dozen actions identical weight, which left
 * nothing to look at first.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast font-semibold shadow-raised hover:brightness-110 active:brightness-95",
  secondary: "border border-line-strong bg-raised text-ink-2 hover:border-accent/50 hover:text-ink",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const SIZES: Record<ButtonSize, string> = {
  // 32/40/48px tall. `lg` is the only size that meets the 44px touch-target
  // guidance on its own, which is why it carries the primary action on every
  // screen; `md` and `sm` are for toolbars where the surrounding row supplies
  // the spacing.
  sm: "h-8 gap-1.5 px-2.5 text-xs rounded-lg",
  md: "h-10 gap-2 px-3.5 text-sm rounded-xl",
  lg: "h-12 gap-2 px-5 text-sm rounded-xl",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner, disables the button, and marks it busy for AT. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    iconLeft,
    iconRight,
    block = false,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export default Button;
