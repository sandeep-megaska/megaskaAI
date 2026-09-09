"use client";

import type { ReactNode } from "react";

/**
 * Two-column studio layout: a control rail that stays put, and a results canvas
 * that scrolls.
 *
 * Both projects previously stacked every control and every result in one long
 * column, so you scrolled past ten inputs to reach Generate, then scrolled back
 * up to change anything. On a wide screen the controls now stay in view beside
 * the output; below `xl` the columns stack and the pages scroll the results
 * into view once a generation lands.
 */
export default function PageShell({
  accent,
  eyebrow,
  title,
  description,
  headerAction,
  rail,
  children,
}: {
  /** Section hue, used for wayfinding between the image and video projects. */
  accent: "violet" | "cyan";
  eyebrow: string;
  title: string;
  description?: string;
  headerAction?: ReactNode;
  /** The control column. */
  rail: ReactNode;
  /** The results canvas. */
  children: ReactNode;
}) {
  return (
    <main id="main-content" data-accent={accent} className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-3">{description}</p>
            ) : null}
          </div>
          {headerAction}
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          {/* Below xl the two columns stack in source order: controls, then
              results. Pages scroll the results into view once a generation
              lands, so the payoff still finds you on a phone. */}
          <div className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
            {rail}
          </div>
          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
