"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import {
  ANCHOR_ITEM_ROLES,
  ANCHOR_PACK_TYPES,
  V2_MODE_OPTIONS,
  type AnchorPack,
  type AnchorPackItem,
  type AnchorPackItemRole,
  type V2Mode,
} from "@/lib/video/v2/types";

type GalleryImage = { id: string; prompt: string; asset_url?: string | null; url?: string | null };
type ValidationResult = {
  id: string;
  overall_score: number;
  decision: "pass" | "retry" | "reject" | "manual_review";
  failure_reasons?: string[];
  created_at: string;
};

function getAssetUrl(item?: { asset_url?: string | null; url?: string | null } | null) {
  return item?.asset_url ?? item?.url ?? null;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function excerpt(text?: string | null, max = 90) {
  if (!text) return "No prompt captured.";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function AssetGallery(props: {
  images: GalleryImage[];
  selectedGenerationId: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  const { images, selectedGenerationId, onSelect, loading } = props;

  return (
    <div className="space-y-2">
      <h3 className="font-medium">Visual Asset Gallery</h3>
      <p className="text-xs text-zinc-400">Choose video-stable anchors, not just pretty stills.</p>
      <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-auto rounded border border-zinc-800 p-2 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((image) => {
          const imageUrl = getAssetUrl(image);
          const active = selectedGenerationId === image.id;
          return (
            <button
              type="button"
              key={image.id}
              onClick={() => onSelect(image.id)}
              className={`overflow-hidden rounded border p-2 text-left transition ${
                active ? "border-sky-400 bg-sky-500/10" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
              }`}
            >
              <div className="mb-2 flex h-28 items-center justify-center overflow-hidden rounded bg-zinc-950">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={`asset ${shortId(image.id)}`} className="h-full w-full object-cover" />
                ) : (
                  <span className="px-3 text-center text-xs text-zinc-500">No image URL available</span>
                )}
              </div>
              <p className="text-xs font-medium text-zinc-100">Asset {shortId(image.id)}</p>
              <p className="mt-1 text-xs text-zinc-400">{excerpt(image.prompt)}</p>
            </button>
          );
        })}
        {!images.length && !loading ? <p className="col-span-full p-2 text-sm text-zinc-500">No recent image assets found.</p> : null}
      </div>
    </div>
  );
}

function PackItemsList(props: {
  packId: string;
  items: AnchorPackItem[];
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { packId, items, onReload, onError } = props;
  const roleCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.role] = (acc[item.role] ?? 0) + 1;
    return acc;
  }, {});

  async function runMutation(body: Record<string, unknown>, fallbackError: string) {
    const res = await fetch(`/api/studio/video/v2/anchor-packs/${packId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) return onError(payload.error ?? fallbackError);
    await onReload();
  }

  return (
    <div className="space-y-2">
      <h3 className="font-medium">Pack items</h3>
      <div className="max-h-[420px] space-y-2 overflow-auto rounded border border-zinc-800 p-2 text-xs">
        {items.map((item, index) => {
          const imageUrl = getAssetUrl(item.generation);
          const duplicate = roleCounts[item.role] > 1;
          const lowStability = Number(item.stability_score ?? 0) < 0.45;
          return (
            <div key={item.id} className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
              <div className="flex gap-2">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-950">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={`pack item ${shortId(item.id)}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">No preview</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-zinc-400">Asset {shortId(item.generation_id)}</p>
                  <p className="text-[11px] text-zinc-300">Stability {(item.stability_score ?? 0).toFixed(2)}</p>
                  <p className="truncate text-[11px] text-zinc-500">{excerpt(item.generation?.prompt, 80)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
                  value={item.role}
                  onChange={(event) =>
                    runMutation(
                      {
                        action: "update",
                        item_id: item.id,
                        role: event.target.value,
                      },
                      "Failed to update role.",
                    )
                  }
                >
                  {ANCHOR_ITEM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={index === 0}
                  className="rounded border border-zinc-700 px-2 py-1 disabled:opacity-30"
                  onClick={() => {
                    const nextOrder = [...items];
                    [nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]];
                    return runMutation(
                      { action: "reorder", ordered_item_ids: nextOrder.map((entry) => entry.id) },
                      "Failed to reorder pack items.",
                    );
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  className="rounded border border-zinc-700 px-2 py-1 disabled:opacity-30"
                  onClick={() => {
                    const nextOrder = [...items];
                    [nextOrder[index], nextOrder[index + 1]] = [nextOrder[index + 1], nextOrder[index]];
                    return runMutation(
                      { action: "reorder", ordered_item_ids: nextOrder.map((entry) => entry.id) },
                      "Failed to reorder pack items.",
                    );
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded border border-rose-500/40 px-2 py-1 text-rose-300"
                  onClick={() => runMutation({ action: "remove", item_id: item.id }, "Failed to remove item.")}
                >
                  Remove
                </button>
              </div>

              {duplicate ? <p className="text-[11px] text-amber-300">Duplicate role warning: {item.role} appears multiple times.</p> : null}
              {lowStability ? <p className="text-[11px] text-rose-300">Low-stability warning: anchor may drift under motion.</p> : null}
            </div>
          );
        })}
        {!items.length ? <p className="text-zinc-500">No items assigned yet.</p> : null}
      </div>
    </div>
  );
}

function PackReadinessCard(props: { pack: AnchorPack | null }) {
  if (!props.pack) return null;
  const report = buildPackReadinessReport({
    packType: props.pack.pack_type,
    items: props.pack.anchor_pack_items ?? [],
    aggregateStabilityScore: Number(props.pack.aggregate_stability_score ?? 0),
    priorValidatedClipExists: false,
  });

  return (
    <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="font-medium">Pack Readiness</h2>
      <div className="grid gap-2 text-sm md:grid-cols-3">
        <p>Type: <span className="text-zinc-300">{report.packType}</span></p>
        <p>Aggregate stability: <span className="text-zinc-300">{report.aggregateStabilityScore.toFixed(2)}</span></p>
        <p>Ready: <span className="text-zinc-300">{report.isReady ? "yes" : "no"}</span></p>
        <p>Item count: <span className="text-zinc-300">{report.itemCount}</span></p>
        <p>Risk Level: <span className="text-zinc-300">{report.riskLevel}</span></p>
        <p>Recommended Mode: <span className="text-zinc-300">{report.recommendedMode}</span></p>
      </div>
      <div className="grid gap-2 text-xs text-zinc-300 md:grid-cols-2">
        <p>Present roles: {report.presentRoles.length ? report.presentRoles.join(", ") : "none"}</p>
        <p>Missing Anchor Roles: {report.missingRoles.length ? report.missingRoles.join(", ") : "none"}</p>
        <p>Duplicate/conflicting roles: {report.duplicateRoles.length ? report.duplicateRoles.join(", ") : "none"}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Mode Suitability</h3>
        {report.modeSuitability.map((entry) => (
          <div key={entry.mode} className="rounded border border-zinc-800 p-2 text-xs">
            <p className="font-medium">
              {entry.mode} · {entry.level}
            </p>
            <ul className="ml-4 list-disc text-zinc-400">
              {entry.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-400">{report.riskLevel === "low" ? "Recommended for Veo 3.1" : "Fallback likely due to pack risk."}</p>
      {report.warnings.length ? <p className="text-xs text-amber-300">{report.warnings.join(" ")}</p> : null}
    </section>
  );
}

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
  const [exactEndStateRequired, setExactEndStateRequired] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [desiredMode, setDesiredMode] = useState<"" | V2Mode>("");
  const [error, setError] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);

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
    setLoadingImages(true);
    const { data } = await supabase
      .from("generations")
      .select("id,prompt,asset_url,url")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(40);
    setImages((data ?? []) as GalleryImage[]);
    setLoadingImages(false);
  }

  async function loadValidationResults() {
    const res = await fetch("/api/studio/video/v2/validation-results", { cache: "no-store" });
    const payload = (await res.json()) as { data?: ValidationResult[] };
    if (res.ok) setValidationResults(payload.data ?? []);
  }

  useEffect(() => {
    Promise.all([loadPacks(), loadImages(), loadValidationResults()]).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedPackRoles = Array.from(new Set((selectedPack?.anchor_pack_items ?? []).map((item) => item.role as AnchorPackItemRole)));

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Anchor Pack Builder</h1>
            <p className="text-sm text-zinc-400">Consistency &gt; creativity. Anchor-first planning for fidelity-preserving video generation.</p>
          </div>
          <Link href="/studio/video" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900">
            Back to Video Project
          </Link>
        </div>

        {error ? <p className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}

        <section className="grid gap-4 rounded border border-zinc-800 bg-zinc-900/40 p-4 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="font-medium">Create anchor pack</h2>
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
                const payload = (await res.json()) as { error?: string };
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
          </div>
        </section>

        <section className="grid gap-4 rounded border border-zinc-800 bg-zinc-900/40 p-4 xl:grid-cols-2">
          <div className="space-y-3">
            <AssetGallery
              images={images}
              selectedGenerationId={newItemGenerationId}
              onSelect={setNewItemGenerationId}
              loading={loadingImages}
            />
            <div className="space-y-2 rounded border border-zinc-800 p-3">
              <label className="text-xs text-zinc-400">Fallback selector (safety)</label>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={newItemGenerationId}
                onChange={(event) => setNewItemGenerationId(event.target.value)}
              >
                <option value="">-- Choose image asset --</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {shortId(image.id)} · {excerpt(image.prompt, 64)}
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
                  const payload = (await res.json()) as { error?: string };
                  if (!res.ok) return setError(payload.error ?? "Failed to assign asset.");
                  setNewItemGenerationId("");
                  await loadPacks();
                }}
              >
                Add selected asset to pack
              </button>
            </div>
          </div>

          <PackItemsList
            packId={selectedPackId}
            items={(selectedPack?.anchor_pack_items ?? []).sort((a, b) => a.sort_order - b.sort_order)}
            onReload={loadPacks}
            onError={setError}
          />
        </section>

        <PackReadinessCard pack={selectedPack} />

        <section className="grid gap-3 rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="font-medium">Planning Panel (Director Agent Contract)</h2>
          <textarea
            className="min-h-24 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            value={motionRequest}
            onChange={(event) => setMotionRequest(event.target.value)}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-zinc-300">
              Aspect ratio
              <input
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-300">
              Desired mode override (optional)
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={desiredMode}
                onChange={(event) => setDesiredMode(event.target.value as "" | V2Mode)}
              >
                <option value="">-- let planner decide --</option>
                {V2_MODE_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={exactEndStateRequired} onChange={(event) => setExactEndStateRequired(event.target.checked)} />
            exact_end_state_required
          </label>

          <button
            className="w-fit rounded bg-violet-500 px-3 py-2 text-sm font-medium text-violet-950"
            onClick={async () => {
              const res = await fetch("/api/studio/video/v2/plan", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  selected_pack_id: selectedPack?.id,
                  selected_pack_type: selectedPack?.pack_type,
                  aggregate_stability_score: selectedPack?.aggregate_stability_score,
                  available_roles: selectedPackRoles,
                  motion_request: motionRequest,
                  exact_end_state_required: exactEndStateRequired,
                  aspect_ratio: aspectRatio || "9:16",
                  desired_mode: desiredMode || undefined,
                }),
              });
              const payload = (await res.json()) as { error?: string; plan?: Record<string, unknown>; data?: Record<string, unknown> };
              if (!res.ok) return setError(payload.error ?? "Planning failed.");
              setPlanResponse(payload.plan ?? payload.data ?? null);
            }}
          >
            Generate plan contract
          </button>
          {planResponse ? (
            <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">{JSON.stringify(planResponse, null, 2)}</pre>
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
