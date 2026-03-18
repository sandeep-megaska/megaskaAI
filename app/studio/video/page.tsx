"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AIBackend = { id: string; name: string; type: "image" | "video"; model: string };

const foundationTracks = [
  {
    title: "Start from image",
    description: "Animate an existing fashion frame into motion-driven edits and short cinematic clips.",
  },
  {
    title: "Start from prompt",
    description: "Create scene-to-video concepts directly from text for campaign ideation and storyboarding.",
  },
  {
    title: "Model-led motion videos",
    description: "Design reusable motion prompts for runway turns, camera moves, and pose transitions.",
  },
  {
    title: "Product showcase clips",
    description: "Produce premium spin, detail, and lifestyle product clips optimized for social and PDPs.",
  },
];

export default function VideoProjectPage() {
  const [backends, setBackends] = useState<AIBackend[]>([]);

  useEffect(() => {
    async function loadBackends() {
      const response = await fetch("/api/ai/backends");
      const payload = (await response.json()) as { data?: AIBackend[] };
      setBackends(payload.data ?? []);
    }

    loadBackends();
  }, []);

  const videoBackends = useMemo(() => backends.filter((backend) => backend.type === "video"), [backends]);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/60 to-zinc-950 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Studio Project</p>
              <h1 className="text-3xl font-semibold text-white">Video Project</h1>
              <p className="text-sm text-zinc-300">
                This space is dedicated to future AI video generation workflows. Video production is currently under development,
                and this page provides the foundation for upcoming motion pipelines.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950/70 p-1">
              <Link href="/" className="rounded-md px-4 py-2 text-sm text-zinc-300 hover:text-white">
                Image Project
              </Link>
              <Link href="/studio/video" className="rounded-md bg-cyan-500 px-4 py-2 text-sm text-slate-950">
                Video Project
              </Link>
            </div>
          </div>
          <div className="mt-5 inline-flex rounded-full border border-cyan-300/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
            Under Development · Video workflow coming soon
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Video-capable backends (foundation)</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Reserved for video-capable models only. Full generation controls will be enabled once the workflow is stable.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {videoBackends.length ? (
              videoBackends.map((backend) => (
                <article key={backend.id} className="rounded-lg border border-white/10 bg-zinc-950/60 p-4">
                  <p className="text-sm font-medium text-zinc-100">{backend.name}</p>
                  <p className="mt-1 text-xs text-zinc-400">{backend.model}</p>
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-zinc-950/50 p-4 text-sm text-zinc-400">
                No video backends are configured yet.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Planned workflow tracks</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {foundationTracks.map((track) => (
              <article key={track.title} className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
                <h3 className="text-sm font-medium text-zinc-100">{track.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{track.description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
