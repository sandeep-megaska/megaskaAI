"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import AutoProductionModal from "@/app/studio/video/v2/AutoProductionModal";
import ProductionContextPanel from "@/app/studio/video/v2/components/ProductionContextPanel";
import ProductionIntelligencePanel from "@/app/studio/video/v2/components/ProductionIntelligencePanel";
import ProductionWorkspace from "@/app/studio/video/v2/components/ProductionWorkspace";
import { excerpt, getAssetUrl, shortId } from "@/app/studio/video/v2/components/helpers";
import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import {
  ANCHOR_ITEM_ROLES,
  ANCHOR_PACK_TYPES,
  type AnchorPack,
  type AnchorPackItem,
  type AnchorPackItemRole,
  type DirectorPlanContract,
  type ExecuteVideoRunRequest,
  type ExportPreparationView,
  type SequenceTimelineView,
  type VideoSequence,
  type VideoRunHistoryRecord,
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
type ModelOption = { id: string; display_name: string };
type GarmentOption = { id: string; display_name: string };
type PlanApiResponse = { id?: string };

function actionLabel(action: "same_plan" | "fallback_provider" | "safer_mode") {
  if (action === "same_plan") return "Retry same plan";
  if (action === "fallback_provider") return "Retry with fallback model";
  return "Retry with safer mode";
}

function AssetGallery(props: { images: GalleryImage[]; selectedGenerationId: string; onSelect: (id: string) => void; loading: boolean }) {
  const { images, selectedGenerationId, onSelect, loading } = props;
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Visual Asset Gallery</h3>
      <div className="grid max-h-[320px] grid-cols-1 gap-3 overflow-auto rounded-xl border border-zinc-800 p-2 sm:grid-cols-2">
        {images.map((image) => {
          const imageUrl = getAssetUrl(image);
          const active = selectedGenerationId === image.id;
          return (
            <button type="button" key={image.id} onClick={() => onSelect(image.id)} className={`overflow-hidden rounded border p-2 text-left ${active ? "border-sky-400 bg-sky-500/10" : "border-zinc-800 bg-zinc-900/40"}`}>
              <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded bg-zinc-950">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={`asset ${shortId(image.id)}`} className="h-full w-full object-cover" />
                ) : <span className="text-xs text-zinc-500">No image URL</span>}
              </div>
              <p className="text-xs font-medium">Asset {shortId(image.id)}</p>
              <p className="mt-1 text-xs text-zinc-400">{excerpt(image.prompt)}</p>
            </button>
          );
        })}
        {!images.length && !loading ? <p className="col-span-full p-2 text-sm text-zinc-500">No recent image assets found.</p> : null}
      </div>
    </div>
  );
}

function PackItemsList(props: { packId: string; items: AnchorPackItem[]; packType?: (typeof ANCHOR_PACK_TYPES)[number]; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const { packId, items, packType, onReload, onError } = props;
  async function runMutation(body: Record<string, unknown>, fallbackError: string) {
    const res = await fetch(`/api/studio/video/v2/anchor-packs/${packId}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) return onError(payload.error ?? fallbackError);
    await onReload();
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <h3 id="pack-items-heading" tabIndex={-1} className="font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400">Pack items</h3>
        {packType === "identity" ? <p className="text-xs text-zinc-400">Required roles: front, three_quarter_left, three_quarter_right.</p> : null}
        {packType === "garment" ? <p className="text-xs text-zinc-400">Required roles: front, back, detail.</p> : null}
        {packType === "scene" ? <p className="text-xs text-zinc-400">Required role: context (at least 2 scene-compatible anchors recommended for stability).</p> : null}
        {packType === "hybrid" ? <p className="text-xs text-zinc-400">Required roles: front, fit_anchor, start_frame.</p> : null}
      </div>
      <div className="max-h-[420px] space-y-2 overflow-auto rounded-xl border border-zinc-800 p-2 text-xs">
        {items.map((item, index) => (
          <div key={item.id} className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
            <p className="text-zinc-400">{shortId(item.generation_id)} · {item.role} · stability {(item.stability_score ?? 0).toFixed(2)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <select className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1" value={item.role} onChange={(event) => runMutation({ action: "update", item_id: item.id, role: event.target.value }, "Failed to update role.")}>
                {ANCHOR_ITEM_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <button type="button" disabled={index === 0} className="rounded border border-zinc-700 px-2 py-1 disabled:opacity-30" onClick={() => {
                const nextOrder = [...items];
                [nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]];
                return runMutation({ action: "reorder", ordered_item_ids: nextOrder.map((entry) => entry.id) }, "Failed to reorder pack items.");
              }}>↑</button>
              <button type="button" disabled={index === items.length - 1} className="rounded border border-zinc-700 px-2 py-1 disabled:opacity-30" onClick={() => {
                const nextOrder = [...items];
                [nextOrder[index], nextOrder[index + 1]] = [nextOrder[index + 1], nextOrder[index]];
                return runMutation({ action: "reorder", ordered_item_ids: nextOrder.map((entry) => entry.id) }, "Failed to reorder pack items.");
              }}>↓</button>
              <button type="button" className="rounded border border-rose-500/40 px-2 py-1 text-rose-300" onClick={() => runMutation({ action: "remove", item_id: item.id }, "Failed to remove item.")}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
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
  const [planResponse, setPlanResponse] = useState<DirectorPlanContract | null>(null);
  const [planRecord, setPlanRecord] = useState<PlanApiResponse | null>(null);
  const [runHistory, setRunHistory] = useState<VideoRunHistoryRecord[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [exactEndStateRequired, setExactEndStateRequired] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [desiredMode, setDesiredMode] = useState<"" | V2Mode>("frames_to_video");
  const [error, setError] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [executingRun, setExecutingRun] = useState(false);
  const [pendingBranchMeta, setPendingBranchMeta] = useState<{ branched_from_run_id: string; branch_type: "next_shot" } | null>(null);
  const [extendSourceRun, setExtendSourceRun] = useState<VideoRunHistoryRecord | null>(null);
  const [continuationPrompt, setContinuationPrompt] = useState("");
  const [continuationDuration, setContinuationDuration] = useState(6);
  const [continuationSeed, setContinuationSeed] = useState("");
  const [extendingRun, setExtendingRun] = useState(false);
  const [sequences, setSequences] = useState<VideoSequence[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState("");
  const [sequenceName, setSequenceName] = useState("");
  const [sequenceTimeline, setSequenceTimeline] = useState<SequenceTimelineView | null>(null);
  const [exportPreparation, setExportPreparation] = useState<ExportPreparationView | null>(null);
  const [renderingSequence, setRenderingSequence] = useState(false);
  const [renderNote, setRenderNote] = useState<string | null>(null);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [garments, setGarments] = useState<GarmentOption[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<"manual" | "auto">("manual");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  async function loadPacks() { const res = await fetch("/api/studio/video/v2/anchor-packs", { cache: "no-store" }); const payload = (await res.json()) as { data?: AnchorPack[]; error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to load anchor packs."); const next = payload.data ?? []; setPacks(next); if (!selectedPackId && next[0]?.id) setSelectedPackId(next[0].id); }
  async function loadImages() { if (!supabase) return; setLoadingImages(true); const { data } = await supabase.from("generations").select("id,prompt,asset_url,url").eq("generation_kind", "image").order("created_at", { ascending: false }).limit(40); setImages((data ?? []) as GalleryImage[]); setLoadingImages(false); }
  async function loadValidationResults() { const res = await fetch("/api/studio/video/v2/validation-results", { cache: "no-store" }); const payload = (await res.json()) as { data?: ValidationResult[] }; if (res.ok) setValidationResults(payload.data ?? []); }
  async function loadRuns() { setLoadingRuns(true); const res = await fetch("/api/studio/video/v2/runs", { cache: "no-store" }); const payload = (await res.json()) as { data?: VideoRunHistoryRecord[]; error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to load run history."); setRunHistory(payload.data ?? []); setLoadingRuns(false); }
  async function loadModelsAndGarments() { const [modelsRes, garmentsRes] = await Promise.all([fetch("/api/models", { cache: "no-store" }), fetch("/api/garments", { cache: "no-store" })]); const modelsPayload = (await modelsRes.json()) as { data?: Array<{ id: string; display_name: string }> }; const garmentsPayload = (await garmentsRes.json()) as { data?: Array<{ id: string; display_name: string }> }; if (modelsRes.ok) setModels((modelsPayload.data ?? []).map((item) => ({ id: item.id, display_name: item.display_name }))); if (garmentsRes.ok) setGarments((garmentsPayload.data ?? []).map((item) => ({ id: item.id, display_name: item.display_name }))); }
  async function loadSequences() { const res = await fetch("/api/studio/video/v2/sequences", { cache: "no-store" }); const payload = (await res.json()) as { data?: VideoSequence[]; error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to load sequences."); const data = payload.data ?? []; setSequences(data); if (!selectedSequenceId && data[0]?.id) setSelectedSequenceId(data[0].id); }
  async function loadSequenceTimeline(sequenceId: string) { if (!sequenceId) { setSequenceTimeline(null); setExportPreparation(null); return; } const res = await fetch(`/api/studio/video/v2/sequences/${sequenceId}`, { cache: "no-store" }); const payload = (await res.json()) as { data?: { timeline?: SequenceTimelineView; export_preparation?: ExportPreparationView }; error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to load sequence timeline."); setSequenceTimeline(payload.data?.timeline ?? null); setExportPreparation(payload.data?.export_preparation ?? null); }

  useEffect(() => { Promise.all([loadPacks(), loadImages(), loadValidationResults(), loadRuns(), loadSequences(), loadModelsAndGarments()]).catch((e) => setError(String(e))); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadSequenceTimeline(selectedSequenceId).catch((e) => setError(e instanceof Error ? e.message : "Failed to load sequence timeline.")); }, [selectedSequenceId]);

  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedPackRoles = Array.from(new Set((selectedPack?.anchor_pack_items ?? []).map((item) => item.role as AnchorPackItemRole)));
  const selectedPackReadiness = selectedPack
    ? buildPackReadinessReport({
        packType: selectedPack.pack_type,
        items: selectedPack.anchor_pack_items ?? [],
        aggregateStabilityScore: Number(selectedPack.aggregate_stability_score ?? 0),
        priorValidatedClipExists: false,
      })
    : null;
  const packReadyForPlan = Boolean(selectedPackReadiness?.isReady);
  const blockedPlanReason = !selectedPack
    ? "Select a pack before generating a plan."
    : selectedPackReadiness?.missingRoles.length
      ? `Complete required anchors first: ${selectedPackReadiness.missingRoles.join(", ")}.`
      : selectedPackReadiness && selectedPackReadiness.aggregateStabilityScore < 0.65
        ? "Improve anchor quality. Aggregate stability must reach at least 0.65."
        : selectedPackReadiness && !selectedPackReadiness.isReady && selectedPackReadiness.warnings.length
          ? selectedPackReadiness.warnings[0]
        : null;
  const hasRunnablePlan = Boolean(planRecord?.id && planResponse && selectedPack?.id);
  const [dismissedResultRunIds, setDismissedResultRunIds] = useState<string[]>([]);
  const latestRunForSelectedPack = runHistory.find((run) => run.selected_pack_id === selectedPackId && !dismissedResultRunIds.includes(run.id)) ?? null;
  const fallbackVisibleRun = latestRunForSelectedPack ?? runHistory.find((run) => !dismissedResultRunIds.includes(run.id)) ?? null;
  const selectedVisibleRun =
    (selectedRunId ? runHistory.find((run) => run.id === selectedRunId && !dismissedResultRunIds.includes(run.id)) : null) ?? null;
  const latestVisibleRun = selectedVisibleRun ?? fallbackVisibleRun;
  const showingOlderRun = Boolean(latestVisibleRun && selectedPackId && latestVisibleRun.selected_pack_id && latestVisibleRun.selected_pack_id !== selectedPackId);

  useEffect(() => {
    if (!selectedRunId && fallbackVisibleRun?.id) {
      setSelectedRunId(fallbackVisibleRun.id);
      return;
    }
    if (selectedRunId && !runHistory.some((run) => run.id === selectedRunId && !dismissedResultRunIds.includes(run.id))) {
      setSelectedRunId(fallbackVisibleRun?.id ?? null);
    }
  }, [selectedRunId, fallbackVisibleRun?.id, runHistory, dismissedResultRunIds]);

  async function runRecoveryAction(run: VideoRunHistoryRecord, action: "same_plan" | "fallback_provider" | "safer_mode") { try { setError(null); const res = await fetch("/api/studio/video/v2/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source_run_id: run.id, retry_strategy: action, retry_reason: `Operator-triggered ${actionLabel(action).toLowerCase()}.` }) }); const payload = (await res.json()) as { error?: string }; if (!res.ok) throw new Error(payload.error ?? "Recovery retry failed."); await Promise.all([loadRuns(), loadValidationResults()]); } catch (e) { setError(e instanceof Error ? e.message : "Recovery retry failed."); } }
  async function acceptClip(run: VideoRunHistoryRecord) { try { setError(null); const res = await fetch("/api/studio/video/v2/runs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ run_id: run.id, action_type: "accept", accepted_for_sequence: true }) }); const payload = (await res.json()) as { error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to accept clip."); await loadRuns(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to accept clip."); } }
  async function createNextShot(run: VideoRunHistoryRecord) { try { setError(null); const res = await fetch("/api/studio/video/v2/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source_run_id: run.id, action_type: "branch" }) }); const payload = (await res.json()) as { error?: string; data?: { planner_prefill?: { selected_pack_id?: string | null; suggested_motion_request?: string | null; suggested_mode?: V2Mode; aspect_ratio?: string }; lineage_meta?: { branched_from_run_id?: string; branch_type?: "next_shot" } } }; if (!res.ok) throw new Error(payload.error ?? "Failed to prefill next shot."); if (payload.data?.planner_prefill?.selected_pack_id) setSelectedPackId(payload.data.planner_prefill.selected_pack_id); if (payload.data?.planner_prefill?.suggested_motion_request) setMotionRequest(String(payload.data.planner_prefill.suggested_motion_request)); if (payload.data?.planner_prefill?.suggested_mode) setDesiredMode(payload.data.planner_prefill.suggested_mode); if (payload.data?.planner_prefill?.aspect_ratio) setAspectRatio(String(payload.data.planner_prefill.aspect_ratio)); if (payload.data?.lineage_meta?.branched_from_run_id) setPendingBranchMeta({ branched_from_run_id: payload.data.lineage_meta.branched_from_run_id, branch_type: "next_shot" }); } catch (e) { setError(e instanceof Error ? e.message : "Failed to prefill next shot."); } }
  async function runExtension() { if (!extendSourceRun) return; try { setError(null); setExtendingRun(true); const res = await fetch("/api/studio/video/v2/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source_run_id: extendSourceRun.id, action_type: "extend", continuation_prompt: continuationPrompt.trim(), duration_seconds: continuationDuration, new_seed: continuationSeed.trim() ? Number(continuationSeed) : undefined }) }); const payload = (await res.json()) as { error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to extend clip."); setExtendSourceRun(null); setContinuationPrompt(""); setContinuationSeed(""); await Promise.all([loadRuns(), loadValidationResults()]); } catch (e) { setError(e instanceof Error ? e.message : "Failed to extend clip."); } finally { setExtendingRun(false); } }
  async function createSequence() { try { setError(null); const res = await fetch("/api/studio/video/v2/sequences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sequence_name: sequenceName }) }); const payload = (await res.json()) as { data?: VideoSequence; error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to create sequence."); setSequenceName(""); await loadSequences(); if (payload.data?.id) setSelectedSequenceId(payload.data.id); } catch (e) { setError(e instanceof Error ? e.message : "Failed to create sequence."); } }
  async function addRunToSequence(run: VideoRunHistoryRecord) { if (!selectedSequenceId) return setError("Choose a target sequence first."); if (!run.accepted_for_sequence) return setError("Only accepted clips can be added to a sequence."); try { setError(null); const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run_id: run.id }) }); const payload = (await res.json()) as { error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to add clip to sequence."); await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]); } catch (e) { setError(e instanceof Error ? e.message : "Failed to add clip to sequence."); } }
  async function exportSequence() { if (!selectedSequenceId || !exportPreparation?.ready_for_export) return; try { setError(null); setRenderNote(null); setRenderingSequence(true); const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/render`, { method: "POST", headers: { "content-type": "application/json" } }); const payload = (await res.json()) as { data?: { message?: string }; error?: string }; if (!res.ok) throw new Error(payload.error ?? "Rendering failed — check clips"); if (payload.data?.message) setRenderNote(payload.data.message); await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]); } catch (e) { setError(e instanceof Error ? e.message : "Rendering failed — check clips"); } finally { setRenderingSequence(false); } }
  async function moveSequenceItem(itemId: string, direction: "move_up" | "move_down") { if (!selectedSequenceId) return; const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/items`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: direction, item_id: itemId }) }); const payload = (await res.json()) as { error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to reorder sequence item."); await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]); }
  async function removeSequenceItem(itemId: string) { if (!selectedSequenceId) return; const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/items/${itemId}`, { method: "DELETE" }); const payload = (await res.json()) as { error?: string }; if (!res.ok) throw new Error(payload.error ?? "Failed to remove sequence item."); await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]); }

  async function onGeneratePlan() {
    if (!packReadyForPlan) {
      setError(blockedPlanReason ?? "Complete required anchors before generating a plan.");
      return;
    }
    const res = await fetch("/api/studio/video/v2/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ selected_pack_id: selectedPack?.id, selected_pack_type: selectedPack?.pack_type, aggregate_stability_score: selectedPack?.aggregate_stability_score, available_roles: selectedPackRoles, motion_request: motionRequest, exact_end_state_required: exactEndStateRequired, aspect_ratio: aspectRatio || "9:16", desired_mode: desiredMode || undefined }) });
    const payload = (await res.json()) as { error?: string; plan?: DirectorPlanContract; data?: PlanApiResponse };
    if (!res.ok) return setError(payload.error ?? "Planning failed.");
    setPlanResponse(payload.plan ?? null);
    setPlanRecord(payload.data ?? null);
  }

  async function onRunPlan() {
    if (!hasRunnablePlan || !planRecord?.id || !selectedPack?.id || !planResponse) return;
    setExecutingRun(true);
    setError(null);
    const providerSelected = planResponse.provider_order?.[0] ?? "veo-3.1";
    const requestPayloadSnapshot = { selected_pack_id: selectedPack.id, mode_selected: planResponse.mode_selected, provider_selected: providerSelected, model_selected: providerSelected, director_prompt: planResponse.director_prompt, fallback_prompt: planResponse.fallback_prompt, aspect_ratio: planResponse.aspect_ratio ?? aspectRatio, duration_seconds: planResponse.duration_seconds ?? 8 } satisfies Record<string, unknown>;
    const body: ExecuteVideoRunRequest = { generation_plan_id: planRecord.id, selected_pack_id: selectedPack.id, mode_selected: planResponse.mode_selected, provider_selected: providerSelected, model_selected: providerSelected, director_prompt: planResponse.director_prompt, fallback_prompt: planResponse.fallback_prompt, aspect_ratio: planResponse.aspect_ratio ?? aspectRatio, duration_seconds: planResponse.duration_seconds ?? 8, request_payload_snapshot: requestPayloadSnapshot, action_type: pendingBranchMeta ? "branch" : undefined, lineage_meta: pendingBranchMeta ?? undefined };
    const res = await fetch("/api/studio/video/v2/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) { setExecutingRun(false); return setError(payload.error ?? "Run creation failed."); }
    await Promise.all([loadRuns(), loadValidationResults()]);
    setPendingBranchMeta(null);
    setExecutingRun(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 md:px-6">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <div id="auto-produce" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Megaska AI Production Studio</h1>
            <p className="text-sm text-zinc-400">Studio V2 is the primary production console for anchor-first manual video generation.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/studio/video/v2/guide" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900">Guide</Link>
            <button type="button" onClick={() => setShowAutoModal(true)} className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Auto Produce Video</button>
          </div>
        </div>

        {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px] lg:grid-cols-[300px_minmax(0,1fr)]">
          <ProductionContextPanel
            packs={packs}
            selectedPack={selectedPack}
            selectedPackId={selectedPackId}
            setSelectedPackId={setSelectedPackId}
            packName={packName}
            setPackName={setPackName}
            packType={packType}
            setPackType={setPackType}
            onCreatePack={async () => {
              setError(null);
              const res = await fetch("/api/studio/video/v2/anchor-packs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pack_name: packName, pack_type: packType }) });
              const payload = (await res.json()) as { error?: string };
              if (!res.ok) return setError(payload.error ?? "Failed to create pack.");
              setPackName("");
              await loadPacks();
            }}
            images={images}
            newItemGenerationId={newItemGenerationId}
            setNewItemGenerationId={setNewItemGenerationId}
            newItemRole={newItemRole}
            setNewItemRole={setNewItemRole}
            onAssignAsset={async () => {
              if (!selectedPackId) return;
              const res = await fetch(`/api/studio/video/v2/anchor-packs/${selectedPackId}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "assign", generation_id: newItemGenerationId, role: newItemRole }) });
              const payload = (await res.json()) as { error?: string };
              if (!res.ok) return setError(payload.error ?? "Failed to assign asset.");
              setNewItemGenerationId("");
              await loadPacks();
            }}
          />

          <div className="space-y-4">
            <ProductionWorkspace
              activeTab={workspaceTab}
              setActiveTab={setWorkspaceTab}
              motionRequest={motionRequest}
              setMotionRequest={setMotionRequest}
              exactEndStateRequired={exactEndStateRequired}
              setExactEndStateRequired={setExactEndStateRequired}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              desiredMode={desiredMode}
              setDesiredMode={setDesiredMode}
              onGeneratePlan={onGeneratePlan}
              onRunPlan={onRunPlan}
              planResponse={planResponse}
              planRecord={planRecord}
              hasRunnablePlan={hasRunnablePlan}
              packReadyForPlan={packReadyForPlan}
              blockedPlanReason={blockedPlanReason}
              executingRun={executingRun}
              pendingBranchLabel={pendingBranchMeta ? `Next run will branch from ${shortId(pendingBranchMeta.branched_from_run_id)}.` : null}
              onOpenAuto={() => setShowAutoModal(true)}
              latestRun={latestVisibleRun}
              showingOlderRun={showingOlderRun}
              selectedPackName={selectedPack?.pack_name ?? null}
              onClearCurrentResult={() => {
                if (!latestVisibleRun) return;
                setDismissedResultRunIds((prev) => [...prev, latestVisibleRun.id]);
                setSelectedRunId((prev) => (prev === latestVisibleRun.id ? null : prev));
              }}
              onRecoveryAction={runRecoveryAction}
              onAcceptClip={acceptClip}
              onExtendClip={(run) => {
                setExtendSourceRun(run);
                setContinuationPrompt("");
                setContinuationDuration(6);
                setContinuationSeed("");
              }}
              onBranchRun={createNextShot}
              onAddToSequence={addRunToSequence}
              selectedSequenceId={selectedSequenceId}
            />

            <section id="pack-builder" className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 xl:grid-cols-2">
              <AssetGallery images={images} selectedGenerationId={newItemGenerationId} onSelect={setNewItemGenerationId} loading={loadingImages} />
              <PackItemsList packId={selectedPackId} packType={selectedPack?.pack_type} items={(selectedPack?.anchor_pack_items ?? []).sort((a, b) => a.sort_order - b.sort_order)} onReload={loadPacks} onError={setError} />
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="font-medium">Sequence controls</h2>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <input className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Sequence name" value={sequenceName} onChange={(event) => setSequenceName(event.target.value)} />
                <button type="button" onClick={createSequence} className="rounded bg-violet-500 px-3 py-2 text-sm font-medium text-violet-950">Create sequence</button>
                <select className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={selectedSequenceId} onChange={(event) => setSelectedSequenceId(event.target.value)}>
                  <option value="">-- Select sequence --</option>
                  {sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.sequence_name} · {sequence.clip_count ?? 0}</option>)}
                </select>
              </div>
            </section>

            {extendSourceRun ? (
              <section className="rounded-2xl border border-cyan-700/40 bg-cyan-950/20 p-4">
                <h2 className="font-medium text-cyan-100">Extend this clip</h2>
                <textarea className="mt-3 min-h-24 w-full rounded border border-cyan-700/50 bg-zinc-950 px-3 py-2 text-sm" placeholder="Describe how this clip should continue from its final frames…" value={continuationPrompt} onChange={(event) => setContinuationPrompt(event.target.value)} />
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input type="number" min={4} max={8} className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={continuationDuration} onChange={(event) => setContinuationDuration(Number(event.target.value || 6))} />
                  <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={continuationSeed} onChange={(event) => setContinuationSeed(event.target.value)} placeholder="Optional seed" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={!continuationPrompt.trim() || extendingRun} onClick={runExtension} className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-cyan-950 disabled:opacity-40">{extendingRun ? "Extending..." : "Start extension run"}</button>
                  <button type="button" disabled={extendingRun} onClick={() => setExtendSourceRun(null)} className="rounded border border-zinc-700 px-3 py-2 text-sm">Cancel</button>
                </div>
              </section>
            ) : null}
          </div>

          <div className="lg:col-span-2 xl:col-span-1">
            <ProductionIntelligencePanel
              runs={runHistory}
              loadingRuns={loadingRuns}
              selectedRunId={selectedRunId}
              onSelectRun={(run) => setSelectedRunId(run.id)}
              validationResults={validationResults}
              sequences={sequences}
              selectedSequenceId={selectedSequenceId}
              setSelectedSequenceId={setSelectedSequenceId}
              sequenceTimeline={sequenceTimeline}
              exportPreparation={exportPreparation}
              renderNote={renderNote}
              renderingSequence={renderingSequence}
              onExportSequence={exportSequence}
              onMoveSequenceItem={moveSequenceItem}
              onRemoveSequenceItem={removeSequenceItem}
            />
          </div>
        </div>

        <AutoProductionModal open={showAutoModal} onClose={() => setShowAutoModal(false)} models={models} garments={garments} />
      </div>
    </main>
  );
}
