"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ImageIcon, Video, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

type GoogleBillingStatus = "ok" | "not_configured" | "error" | "no_data";

type CostSummary = {
  google_billing: {
    status: GoogleBillingStatus;
    source: "google-billing-bigquery";
    currency: string | null;
    this_month_cost: number | null;
    today_cost: number | null;
    last_updated_at: string | null;
    message: string | null;
  };
  estimated_last_generation_usd: number | null;
  estimated_today_usd: number;
  estimated_this_month_usd: number;
};

const navItems = [
  { href: "/", label: "Image Project", icon: ImageIcon, accent: "violet" as const },
  { href: "/video/simple", label: "Video Project", icon: Video, accent: "cyan" as const },
  // Kept for future use:
  // { href: "/models", label: "Models" },
  // { href: "/garments", label: "Garments" },
  // { href: "/try-on", label: "Try-On" },
  // { href: "/lookbook", label: "Lookbook" },
];

function formatCurrency(value: number | null, currency: string | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Spend details sit behind a disclosure rather than permanently beside the
 * logo. Cost is something you check, not something you monitor while writing a
 * prompt, and the old always-on panel outweighed the navigation next to it.
 */
function SpendMenu({ costSummary }: { costSummary: CostSummary | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const billing = costSummary?.google_billing;
  const summaryLabel = !costSummary
    ? "—"
    : billing?.status === "ok"
      ? formatCurrency(billing.this_month_cost, billing.currency)
      : billing?.status === "no_data"
        ? "No data"
        : "Unavailable";

  return (
    <div ref={rootRef} className="relative ml-auto shrink-0 sm:ml-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-xs font-medium text-ink-2 transition-colors",
          "hover:border-line-strong hover:text-ink",
          open && "border-line-strong bg-raised text-ink",
        )}
      >
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Spend</span>
        <span className="tabular-nums text-ink">{summaryLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Google Cloud spend"
          className="absolute right-0 z-40 mt-1.5 w-64 rounded-xl border border-line bg-raised p-3.5 shadow-overlay"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-3">Google Cloud spend</p>

          {costSummary && billing ? (
            <dl className="mt-2.5 space-y-1.5 text-xs">
              {billing.status === "ok" ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">This month</dt>
                    <dd className="tabular-nums text-ink">
                      {formatCurrency(billing.this_month_cost, billing.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">Today</dt>
                    <dd className="tabular-nums text-ink">{formatCurrency(billing.today_cost, billing.currency)}</dd>
                  </div>
                </>
              ) : (
                <p className="text-ink-3">
                  {billing.status === "no_data"
                    ? "No billing data yet."
                    : billing.status === "not_configured"
                      ? "Google billing is not configured."
                      : "Billing data is unavailable right now."}
                </p>
              )}
              <div className="flex justify-between gap-3 border-t border-line pt-1.5">
                <dt className="text-ink-3">Last generation (est.)</dt>
                <dd className="tabular-nums text-ink">
                  {formatCurrency(costSummary.estimated_last_generation_usd, "USD")}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2.5 text-xs text-ink-3">Loading spend summary…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function AppHeader() {
  const pathname = usePathname();
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCostSummary() {
      try {
        const response = await fetch("/api/credits");
        const payload = (await response.json()) as { success?: boolean; data?: CostSummary };
        if (!mounted || !response.ok || !payload.success || !payload.data) return;
        setCostSummary(payload.data);
      } catch {
        if (!mounted) return;
        setCostSummary(null);
      }
    }

    loadCostSummary();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      {/* Lets a keyboard user jump the nav instead of tabbing through it on every page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-contrast"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-x-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-xl">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-line bg-raised">
              <Image src="/logo_megaska.png" alt="" width={36} height={36} className="h-7 w-7 object-contain" priority />
            </span>
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-sm font-semibold tracking-tight text-ink">Megaska AI</span>
              <span className="block truncate text-[11px] text-ink-3">The Creative Studio</span>
            </span>
          </Link>

          {/* One nav for both breakpoints. The old header duplicated the whole
              list into a second mobile row, so the two could drift apart. */}
          <nav aria-label="Projects" className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
            <ul className="flex items-center gap-1 overflow-x-auto">
              {navItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      data-accent={item.accent}
                      className={cn(
                        "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                          : "text-ink-2 hover:bg-raised hover:text-ink",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <SpendMenu costSummary={costSummary} />
        </div>
      </header>
    </>
  );
}
