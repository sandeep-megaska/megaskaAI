import Link from "next/link";

const sections = [
  {
    title: "Overview",
    body: "Megaska AI Studio V2 is a controlled AI video production system focused on deterministic, auditable orchestration.",
    bullets: ["Pipeline: Image → Anchor → Plan → Run → Validate → Sequence → Render"],
  },
  {
    title: "Core Concepts",
    bullets: [
      "Anchor Packs: identity/garment/scene reference sets used to enforce consistency.",
      "Runs: each generated clip is tracked as a versioned execution record.",
      "Recovery: deterministic retries, fallback provider routing, and safer mode recovery.",
      "Sequences: accepted clips assembled into ordered timelines.",
      "Rendering: sequence stitching/export for final output asset delivery.",
    ],
  },
  {
    title: "Manual Workflow",
    bullets: [
      "1. Create packs",
      "2. Check readiness",
      "3. Generate plan",
      "4. Run video",
      "5. Validate",
      "6. Retry if needed",
      "7. Accept clips",
      "8. Build sequence",
      "9. Export video",
    ],
  },
  {
    title: "Auto Mode",
    body: "Use Auto Produce when you want one-click orchestration of plan→run→validate→sequence→render with visible progress.",
    bullets: [
      "Automates shot planning, pack selection, run execution, validation, retries, sequencing, and rendering.",
      "Limitations: output quality still depends on anchor quality, availability of providers, and validation pass rate.",
    ],
  },
  {
    title: "Best Practices",
    bullets: [
      "Small motion > large motion",
      "Stable anchors > prompts",
      "Validate before sequence",
      "Use extension for continuity",
      "Accept only best clips",
    ],
  },
  {
    title: "Troubleshooting",
    bullets: [
      "Wrong garment → improve garment pack coverage (front/back/detail).",
      "Identity drift → improve identity pack stability and angle coverage.",
      "Provider failure → use retry/fallback recommendations.",
      "Sequence mismatch → reorder clips and inspect continuity signals.",
    ],
  },
];

export default function VideoV2GuidePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Megaska Studio V2 Guide</h1>
            <p className="text-sm text-zinc-400">Controlled AI Video Production System</p>
          </div>
          <Link href="/studio/video/v2" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900">
            Back to Studio V2
          </Link>
        </div>

        {sections.map((section) => (
          <section key={section.title} className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-lg font-medium">{section.title}</h2>
            {section.body ? <p className="text-sm text-zinc-300">{section.body}</p> : null}
            {section.bullets?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
