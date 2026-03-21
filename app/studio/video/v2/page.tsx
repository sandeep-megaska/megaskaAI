"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ANCHOR_ITEM_ROLES, ANCHOR_PACK_TYPES, type AnchorPack } from "@/lib/video/v2/types";

type GalleryImage = { id: string; prompt: string; asset_url?: string | null; url?: string | null };
type ValidationResult = {
  id: string;
  overall_score: number;
  decision: "pass" | "retry" | "reject" | "manual_review";
  failure_reasons?: string[];
  created_at: string;
};

export default function VideoV2Page() {
  const [packs, setPacks] = useState<AnchorPack[]>([]);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [packName, setPackName] = useState("");
  const [packType, setPackType] = useState<(typeof ANCHOR_PACK_TYPES)[number]>("identity");
  const [newItemGenerationId, setNewItemGenerationId] = useState("");
  const [newItemRole, setNewItemRole] = useState<(typeof ANCHOR_ITEM_ROLES)[number]>("front");
  const [motionRequest, setMotionRequest] = useState("Subtle breathing with micro shoulder shift while preserving garment fit.");
  const [planResponse, setPlanResponse] = useState<Record<string, unknown> | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  async function loadPacks() {
    const res = await fetch("/api/studio/video/v2/anchor-packs", { cache: "no-store" });
    const payload = (await res.json()) as { data?: AnchorPack[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load anchor packs.");
    const next = payload.data ?? [];
    setPacks(next);
    if (!selectedPackId && next[0]?.id) setSelectedPackId(next[0].id);
  }

  async function loadImages() {
    if (!supabase) return;
    const { data } = await supabase
      .from("generations")
      .select("id,prompt,asset_url,url")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(40);
    setImages((data ?? []) as GalleryImage[]);
  }

  async function loadValidationResults() {
    const res = await fetch("/api/studio/video/v2/validation-results", { cache: "no-store" });
    const payload = (await res.json()) as { data?: ValidationResult[] };
    if (res.ok) setValidationResults(payload.data ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadPacks(), loadImages(), loadValidationResults()]).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      {/* Megaska AI Studio V2: anchor-pack, routing-plan, and validation slice entry. */}
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Megaska AI Studio V2</h1>
            <p className="text-sm text-zinc-400">Anchor-first planning for fidelity-preserving video generation.</p>
          </div>
          <Link href="/studio/video" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900">
            Back to Video Project
          </Link>
        </div>

        {error ? <p className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}

        <section className="grid gap-4 rounded border border-zinc-800 bg-zinc-900/40 p-4 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="font-medium">Anchor Pack Builder</h2>
            <input
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Pack name"
              value={packName}
              onChange={(event) => setPackName(event.target.value)}
            />
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={packType}
              onChange={(event) => setPackType(event.target.value as (typeof ANCHOR_PACK_TYPES)[number])}
            >
              {ANCHOR_PACK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950"
              onClick={async () => {
                setError(null);
                const res = await fetch("/api/studio/video/v2/anchor-packs", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ pack_name: packName, pack_type: packType }),
                });
                const payload = await res.json();
                if (!res.ok) return setError(payload.error ?? "Failed to create pack.");
                setPackName("");
                await loadPacks();
              }}
            >
              Create pack
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-300">Select pack</label>
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={selectedPackId}
              onChange={(event) => setSelectedPackId(event.target.value)}
            >
              <option value="">-- Select --</option>
              {packs.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.pack_name} · {pack.pack_type} · stability {(pack.aggregate_stability_score ?? 0).toFixed(2)}
                </option>
              ))}
            </select>
            {selectedPack ? (
              <p className="text-xs text-zinc-400">
                Status: {selectedPack.status} · Ready: {selectedPack.is_ready ? "yes" : "no"} · Items: {selectedPack.anchor_pack_items?.length ?? 0}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 rounded border border-zinc-800 bg-zinc-900/40 p-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-medium">Assign asset to selected pack</h3>
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={newItemGenerationId}
              onChange={(event) => setNewItemGenerationId(event.target.value)}
            >
              <option value="">-- Choose image asset --</option>
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.id.slice(0, 8)} · {(image.prompt ?? "Untitled").slice(0, 64)}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={newItemRole}
              onChange={(event) => setNewItemRole(event.target.value as (typeof ANCHOR_ITEM_ROLES)[number])}
            >
              {ANCHOR_ITEM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              disabled={!selectedPackId || !newItemGenerationId}
              className="rounded bg-sky-500 px-3 py-2 text-sm font-medium text-sky-950 disabled:opacity-40"
              onClick={async () => {
                if (!selectedPackId) return;
                const res = await fetch(`/api/studio/video/v2/anchor-packs/${selectedPackId}/items`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ action: "assign", generation_id: newItemGenerationId, role: newItemRole }),
                });
                const payload = await res.json();
                if (!res.ok) return setError(payload.error ?? "Failed to assign asset.");
                setNewItemGenerationId("");
                await loadPacks();
              }}
            >
              Add to pack
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Pack items</h3>
            <div className="max-h-56 space-y-2 overflow-auto rounded border border-zinc-800 p-2 text-xs">
              {(selectedPack?.anchor_pack_items ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded border border-zinc-800 p-2">
                  <div>
                    <p className="font-medium">{item.role}</p>
                    <p className="text-zinc-400">stability {(item.stability_score ?? 0).toFixed(2)}</p>
                  </div>
                  <button
                    className="rounded border border-rose-500/40 px-2 py-1 text-rose-300"
                    onClick={async () => {
                      if (!selectedPackId) return;
                      const res = await fetch(`/api/studio/video/v2/anchor-packs/${selectedPackId}/items`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "remove", item_id: item.id }),
                      });
                      const payload = await res.json();
                      if (!res.ok) return setError(payload.error ?? "Failed to remove item.");
                      await loadPacks();
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="font-medium">Planning Panel (Director Agent Contract)</h2>
          <textarea
            className="min-h-24 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            value={motionRequest}
            onChange={(event) => setMotionRequest(event.target.value)}
          />
          <button
            className="w-fit rounded bg-violet-500 px-3 py-2 text-sm font-medium text-violet-950"
            onClick={async () => {
              const res = await fetch("/api/studio/video/v2/plan", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ motion_request: motionRequest, exact_end_state_required: true }),
              });
              const payload = await res.json();
              if (!res.ok) return setError(payload.error ?? "Planning failed.");
              setPlanResponse(payload.plan ?? payload.data ?? null);
            }}
          >
            Generate plan contract
          </button>
          {planResponse ? (
            <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">
              {JSON.stringify(planResponse, null, 2)}
            </pre>
          ) : null}
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="font-medium">Validation Panel</h2>
          <p className="mb-3 text-xs text-zinc-400">Latest run validation snapshots from stored V2 results.</p>
          <div className="space-y-2 text-sm">
            {validationResults.length ? (
              validationResults.map((entry) => (
                <div key={entry.id} className="rounded border border-zinc-800 p-2">
                  <p>
                    score {Number(entry.overall_score ?? 0).toFixed(2)} · decision <span className="font-semibold">{entry.decision}</span>
                  </p>
                  {entry.failure_reasons?.length ? <p className="text-xs text-rose-300">{entry.failure_reasons.join(" | ")}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-zinc-400">No validation results yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
