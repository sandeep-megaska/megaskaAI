"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type CostSummary = {
  estimated_last_gen_usd: number | null;
  estimated_today_usd: number;
  estimated_this_month_usd: number;
};

const navItems = [
  { href: "/", label: "Image Project" },
  { href: "/studio/video", label: "Video Project" },
  { href: "/models", label: "Models" },
  { href: "/garments", label: "Garments" },
  { href: "/try-on", label: "Try-On" },
  { href: "/lookbook", label: "Lookbook" },
];

function formatUsd(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

  const hasAnyEstimatedSpend = useMemo(() => {
    if (!costSummary) return false;
    return (
      costSummary.estimated_last_gen_usd !== null ||
      costSummary.estimated_this_month_usd > 0 ||
      costSummary.estimated_today_usd > 0
    );
  }, [costSummary]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111f]/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/20 bg-white/5 shadow-[0_8px_30px_rgba(34,211,238,0.12)]">
              <Image
                src="/logo_megaska.png"
                alt="Megaska"
                width={44}
                height={44}
                className="h-9 w-9 object-contain"
                priority
              />
            </div>

            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-wide text-white sm:text-lg">
                Megaska AI
              </div>
              <div className="truncate text-xs text-slate-400 sm:text-sm">
                The Creative Studio
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 pl-4 md:flex">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/25"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-2 sm:block">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Gemini Spend (Est.)</div>
            {hasAnyEstimatedSpend && costSummary ? (
              <div className="space-y-0.5 text-xs text-slate-200">
                <p>Last Gen: {formatUsd(costSummary.estimated_last_gen_usd)}</p>
                <p>This Month: {formatUsd(costSummary.estimated_this_month_usd)}</p>
              </div>
            ) : (
              <div className="text-sm font-semibold text-white">No Gemini generations yet</div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 px-4 py-2 md:hidden">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/25"
                    : "bg-white/5 text-slate-300 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
