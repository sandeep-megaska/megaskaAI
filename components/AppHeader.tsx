"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  { href: "/", label: "Image Project" },
  { href: "/studio/video/simple", label: "Video Project" },
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

function renderBillingLines(costSummary: CostSummary) {
  const billing = costSummary.google_billing;

  if (billing.status === "ok") {
    return (
      <>
        <p>This Month: {formatCurrency(billing.this_month_cost, billing.currency)}</p>
        <p>Today: {formatCurrency(billing.today_cost, billing.currency)}</p>
      </>
    );
  }

  if (billing.status === "no_data") {
    return <p>This Month: No billing data yet</p>;
  }

  if (billing.status === "not_configured") {
    return <p>Google Billing: Not configured</p>;
  }

  return <p>Google Billing: Unavailable</p>;
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
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Google Cloud Spend</div>
            {costSummary ? (
              <div className="space-y-0.5 text-xs text-slate-200">
                {renderBillingLines(costSummary)}
                <p>
                  Last Gen (Est.): {formatCurrency(costSummary.estimated_last_generation_usd, "USD")}
                </p>
              </div>
            ) : (
              <div className="text-xs text-slate-200">Loading spend summary…</div>
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
