"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ClipIntent = { id: string; intent_label: string; source_profile_id: string; status: string; created_at: string };
type WorkingPack = {
  id: string;
  clip_intent_id: string;
  status: string;
  readiness_score: number;
  warning_messages: string[];
  working_pack_items?: Array<{ id: string; role: string; source_kind: string; generation_id: string | null; confidence_score: number }>;
  pack_lineage?: Array<{ id: string; lineage_type: string; source_generation_id: string | null; derived_generation_id: string | null }>;
};

export default function WorkingPackReviewPage() {
  const [intents, setIntents] = useState<ClipIntent[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState("");
  const [packs, setPacks] = useState<WorkingPack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function loadIntents() {
    const res = await fetch("/api/studio/video/v2/clip-intents", { cache: "no-store" });
    const payload = (await res.json()) as { data?: ClipIntent[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load clip intents.");
    const next = payload.data ?? [];
    setIntents(next);
    if (!selectedIntentId && next[0]?.id) setSelectedIntentId(next[0].id);
  }

  async function loadPacks() {
    const res = await fetch("/api/studio/video/v2/working-packs", { cache: "no-store" });
    const payload = (await res.json()) as { data?: WorkingPack[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load working packs.");
    setPacks(payload.data ?? []);
  }

  useEffect(() => {
    Promise.all([loadIntents(), loadPacks()]).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to initialize working pack review.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autoBuild() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);

    const res = await fetch("/api/studio/video/v2/working-packs/auto-build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clip_intent_id: selectedIntentId }),
    });

    const payload = (await res.json()) as { data?: { pack?: { id: string }; readiness?: { score: number; warnings: string[] } }; error?: string };
    if (!res.ok) return setError(payload.error ?? "Auto-build failed.");

    const score = payload.data?.readiness?.score ?? 0;
    const warnings = payload.data?.readiness?.warnings ?? [];
    setNote(`Working pack built. Readiness score: ${score.toFixed(2)}${warnings.length ? ` · warnings: ${warnings.join(" | ")}` : ""}`);
    await loadPacks();
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Working Pack Review (Slice B)</h1>
            <p className="text-sm text-zinc-400">Auto-build creates front + fit_anchor baseline and traces all reuse/synthesis lineage.</p>
          </div>
          <Link href="/studio/video/v2/create-clip" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900">Back to Create Clip</Link>
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <h2 className="font-medium">Auto-build from clip intent</h2>
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={selectedIntentId} onChange={(event) => setSelectedIntentId(event.target.value)}>
            <option value="">-- select clip intent --</option>
            {intents.map((intent) => (
              <option key={intent.id} value={intent.id}>{intent.intent_label} ({intent.id.slice(0, 8)})</option>
            ))}
          </select>
          <button type="button" onClick={autoBuild} className="rounded bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950">Auto-build Working Pack</button>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="font-medium">Working packs</h2>
          <div className="mt-3 space-y-3">
            {packs.map((pack) => (
              <article key={pack.id} className="rounded border border-zinc-700 p-3 text-sm">
                <p className="font-medium">Pack {pack.id.slice(0, 8)} · intent {pack.clip_intent_id.slice(0, 8)} · status {pack.status}</p>
                <p className="text-zinc-400">Readiness {Number(pack.readiness_score ?? 0).toFixed(2)}</p>
                {pack.warning_messages?.length ? <p className="text-amber-300">Warnings: {pack.warning_messages.join(" | ")}</p> : null}
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(pack.working_pack_items ?? []).map((item) => (
                    <div key={item.id} className="rounded border border-zinc-800 bg-zinc-950 p-2 text-xs">
                      <p>{item.role} · {item.source_kind} · conf {Number(item.confidence_score ?? 0).toFixed(2)}</p>
                      <p className="text-zinc-400">gen {item.generation_id ? item.generation_id.slice(0, 8) : "synthesized"}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-zinc-500">Lineage events: {(pack.pack_lineage ?? []).length}</p>
              </article>
            ))}
            {!packs.length ? <p className="text-sm text-zinc-500">No working packs yet.</p> : null}
          </div>
        </section>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {note ? <p className="text-sm text-emerald-300">{note}</p> : null}
      </div>
    </main>
  );
}
