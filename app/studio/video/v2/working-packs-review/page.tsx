"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ClipIntent = {
  id: string;
  intent_label: string;
  source_profile_id: string;
  status: string;
  created_at: string;
  compiled_anchor_pack_id?: string | null;
  compiled_run_request?: Record<string, unknown> | null;
  last_compiled_at?: string | null;
};
type WorkingPack = {
  id: string;
  clip_intent_id: string;
  status: string;
  readiness_score: number;
  warning_messages: string[];
  working_pack_items?: Array<{ id: string; role: string; source_kind: string; generation_id: string | null; confidence_score: number }>;
  pack_lineage?: Array<{ id: string; lineage_type: string; source_generation_id: string | null; derived_generation_id: string | null }>;
};

type CompileResponse = {
  clip_intent_id: string;
  compiled_anchor_pack_id: string;
  warnings: string[];
  run_request_preview: Record<string, unknown>;
};

export default function WorkingPackReviewPage() {
  const [intents, setIntents] = useState<ClipIntent[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState("");
  const [packs, setPacks] = useState<WorkingPack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [compiledState, setCompiledState] = useState<CompileResponse | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const activePack = useMemo(
    () => packs.find((pack) => pack.clip_intent_id === selectedIntentId) ?? null,
    [packs, selectedIntentId],
  );

  const compileBlockedReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!activePack) {
      reasons.push("No working pack found for this clip intent.");
      return reasons;
    }
    if (activePack.status !== "ready") reasons.push("Working pack must be ready/approved before compile.");
    if (Number(activePack.readiness_score ?? 0) < 0.55) reasons.push("Readiness score must be >= 0.55.");

    const roles = new Set((activePack.working_pack_items ?? []).map((item) => item.role));
    if (!roles.has("fit_anchor")) reasons.push("Required role missing: fit_anchor.");
    if (!roles.has("front")) reasons.push("Required role missing: front.");
    return reasons;
  }, [activePack]);

  async function autoBuild() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);

    const res = await fetch("/api/studio/video/v2/working-packs/auto-build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clip_intent_id: selectedIntentId }),
    });

    const payload = (await res.json()) as { data?: { readiness?: { score: number; warnings: string[] } }; error?: string };
    if (!res.ok) return setError(payload.error ?? "Auto-build failed.");

    const score = payload.data?.readiness?.score ?? 0;
    const warnings = payload.data?.readiness?.warnings ?? [];
    setNote(`Working pack built. Readiness score: ${score.toFixed(2)}${warnings.length ? ` · warnings: ${warnings.join(" | ")}` : ""}`);
    await loadPacks();
  }

  async function compileIntent() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);
    setIsCompiling(true);

    try {
      const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/compile`, { method: "POST" });
      const payload = (await res.json()) as { data?: CompileResponse; error?: string };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Compile failed.");
      setCompiledState(payload.data);
      setNote(`Compiled anchor pack ${payload.data.compiled_anchor_pack_id.slice(0, 8)} is ready.`);
      await Promise.all([loadIntents(), loadPacks()]);
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "Compile failed.");
    } finally {
      setIsCompiling(false);
    }
  }

  async function generateClip() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);
    setIsGenerating(true);

    try {
      const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/generate`, { method: "POST" });
      const payload = (await res.json()) as { data?: { run_id: string; status: string; compiled_anchor_pack_id: string | null }; error?: string };
      if (!res.ok || !payload.data?.run_id) throw new Error(payload.error ?? "Generate failed.");
      setLastRunId(payload.data.run_id);
      setNote(`Generation started via V2 runs pipeline. Run ${payload.data.run_id.slice(0, 8)} · status ${payload.data.status}.`);
      await loadIntents();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Generate failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Working Pack Review (Slice C)</h1>
            <p className="text-sm text-zinc-400">Auto-build, compile to ephemeral anchor packs, then generate through existing V2 runs.</p>
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
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={autoBuild} className="rounded bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950">Auto-build Working Pack</button>
            <button type="button" onClick={compileIntent} disabled={isCompiling || compileBlockedReasons.length > 0} className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">{isCompiling ? "Compiling..." : "Compile"}</button>
            <button type="button" onClick={generateClip} disabled={isGenerating || compileBlockedReasons.length > 0} className="rounded bg-violet-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">{isGenerating ? "Generating..." : "Generate Clip"}</button>
          </div>
          {compileBlockedReasons.length ? (
            <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
              <p className="font-medium">Readiness gate blocked</p>
              <ul className="mt-1 list-disc pl-4">
                {compileBlockedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="font-medium">Compiled state</h2>
          <p className="mt-2 text-sm text-zinc-300">Compiled anchor pack: {compiledState?.compiled_anchor_pack_id?.slice(0, 8) ?? intents.find((intent) => intent.id === selectedIntentId)?.compiled_anchor_pack_id?.slice(0, 8) ?? "none"}</p>
          <p className="text-sm text-zinc-300">Run id: {lastRunId ? lastRunId.slice(0, 8) : "none"}</p>
          {compiledState?.warnings?.length ? <p className="mt-1 text-sm text-amber-300">Compile warnings: {compiledState.warnings.join(" | ")}</p> : null}
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
