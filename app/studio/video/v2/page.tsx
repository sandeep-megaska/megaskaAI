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

type PlanApiResponse = {
  id?: string;
  mode_selected?: V2Mode;
  provider_order?: string[];
  director_prompt?: string;
  fallback_prompt?: string;
  duration_seconds?: number;
  aspect_ratio?: string;
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

function statusTone(status: string) {
  if (status === "validated") return "text-emerald-300";
  if (status === "succeeded" || status === "completed") return "text-emerald-200";
  if (status === "running") return "text-sky-300";
  if (status === "queued" || status === "planned") return "text-amber-200";
  if (status === "failed") return "text-rose-300";
  return "text-zinc-300";
}

function actionLabel(action: "same_plan" | "fallback_provider" | "safer_mode") {
  if (action === "same_plan") return "Retry same plan";
  if (action === "fallback_provider") return "Retry with fallback model";
  return "Retry with safer mode";
}

function continuityTone(status: "good" | "warning" | "major_mismatch") {
  if (status === "good") return "text-emerald-300";
  if (status === "major_mismatch") return "text-rose-300";
  return "text-amber-300";
}

function continuityIcon(status: "good" | "warning" | "major_mismatch") {
  if (status === "good") return "✓";
  if (status === "major_mismatch") return "❌";
  return "⚠";
}


function sequenceStatusTone(status: string) {
  if (status === "ready") return "text-emerald-300";
  if (status === "rendering") return "text-sky-300";
  if (status === "exported") return "text-emerald-200";
  if (status === "failed") return "text-rose-300";
  return "text-zinc-300";
}

function sequenceStatusLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "rendering") return "Rendering";
  if (status === "exported") return "Exported";
  if (status === "failed") return "Failed";
  return "Draft";
}

function runSupportsSuccessActions(run: VideoRunHistoryRecord) {
  if (run.status !== "succeeded" && run.status !== "validated") return false;
  if (!run.validation) return true;
  return run.validation.decision === "pass" || run.validation.decision === "manual_review";
}

function RunHistoryPanel(props: {
  runs: VideoRunHistoryRecord[];
  sequences: VideoSequence[];
  selectedSequenceId: string;
  onSelectSequence: (id: string) => void;
  loading: boolean;
  onRecoveryAction: (run: VideoRunHistoryRecord, action: "same_plan" | "fallback_provider" | "safer_mode") => Promise<void>;
  onAcceptClip: (run: VideoRunHistoryRecord) => Promise<void>;
  onExtendClip: (run: VideoRunHistoryRecord) => void;
  onBranchRun: (run: VideoRunHistoryRecord) => Promise<void>;
  onAddToSequence: (run: VideoRunHistoryRecord) => Promise<void>;
  runningRecoveryFor: string | null;
  acceptingRunId: string | null;
  branchingRunId: string | null;
  addingToSequenceRunId: string | null;
}) {
  const [acceptedOnly, setAcceptedOnly] = useState(false);
  if (props.loading) return <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">Loading run history…</section>;
  const visibleRuns = acceptedOnly ? props.runs.filter((run) => run.accepted_for_sequence) : props.runs;

  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="font-medium">Run History</h2>
      <p className="mb-3 text-xs text-zinc-400">Most recent execution attempts first. Track plan → run → validation in one place.</p>
      <div className="mb-3 max-w-xs space-y-1 text-xs">
        <label className="text-zinc-400">Target sequence for “Add to sequence”</label>
        <select
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
          value={props.selectedSequenceId}
          onChange={(event) => props.onSelectSequence(event.target.value)}
        >
          <option value="">-- Select sequence --</option>
          {props.sequences.map((sequence) => (
            <option key={sequence.id} value={sequence.id}>
              {sequence.sequence_name}
            </option>
          ))}
        </select>
      </div>
      <label className="mb-3 inline-flex items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={acceptedOnly} onChange={(event) => setAcceptedOnly(event.target.checked)} />
        Show accepted clips only
      </label>
      <div className="space-y-2">
        {visibleRuns.length ? (
          visibleRuns.map((run) => (
            <div key={run.id} className="rounded border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <p className="text-zinc-300">{new Date(run.created_at).toLocaleString()}</p>
                <p className={`font-medium uppercase ${statusTone(run.status)}`}>{run.status}</p>
                <p className="text-zinc-400">Mode: {run.mode_selected}</p>
                <p className="text-zinc-400">Provider/model: {run.provider_used ?? "n/a"} / {run.provider_model ?? "n/a"}</p>
              </div>
              {run.retried_from_run_id ? (
                <p className="mt-1 text-xs text-violet-300">
                  Retried from {shortId(run.retried_from_run_id)} using {run.retry_strategy ?? "retry"}.
                </p>
              ) : null}
              {run.source_run_id && run.extension_type === "scene_extension" ? (
                <p className="mt-1 text-xs text-cyan-300">Extended from run {shortId(run.source_run_id)}.</p>
              ) : null}
              {run.branched_from_run_id && run.branch_type === "next_shot" ? (
                <p className="mt-1 text-xs text-indigo-300">Branched from run {shortId(run.branched_from_run_id)}.</p>
              ) : null}
              <div className="mt-2 grid gap-1 text-xs text-zinc-400 md:grid-cols-2">
                <p>Pack used: <span className="text-zinc-300">{run.selected_pack_name ?? run.selected_pack_id ?? "unknown pack"}</span></p>
                <p>Aspect ratio: <span className="text-zinc-300">{String(run.request_payload_snapshot?.aspect_ratio ?? "n/a")}</span></p>
                <p>Duration: <span className="text-zinc-300">{String(run.request_payload_snapshot?.duration_seconds ?? "n/a")}s</span></p>
                <p>Prompt: <span className="text-zinc-300">{excerpt((run.request_payload_snapshot?.director_prompt as string | undefined) ?? "", 120)}</span></p>
              </div>
              {run.output_asset_url ? (
                <div className="mt-2">
                  <p className="mb-1 text-xs text-zinc-400">Output preview</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={run.output_thumbnail_url ?? run.output_asset_url} alt={`Run ${shortId(run.id)} output preview`} className="h-24 rounded border border-zinc-800 object-cover" />
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Output preview unavailable.</p>
              )}
              {run.failure_message ? <p className="mt-2 text-xs text-rose-300">Run failed: {run.failure_message}</p> : null}
              {run.validation ? (
                <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
                  <p className="font-medium text-emerald-200">Validated · score {Number(run.validation.overall_score ?? 0).toFixed(2)} · decision {run.validation.decision}</p>
                  {run.validation.failure_reasons?.length ? <p className="text-rose-200">{run.validation.failure_reasons.join(" | ")}</p> : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">No validation yet.</p>
              )}
              {run.recovery_recommendation ? (
                <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
                  <p className="font-medium text-zinc-100">Recommended recovery: {run.recovery_recommendation.primary_recommendation}</p>
                  <p className="mt-1 text-zinc-400">{run.recovery_recommendation.reasons.join(" ")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["same_plan", "fallback_provider", "safer_mode"] as const).map((action) => {
                      const key =
                        action === "same_plan"
                          ? "retry_same_plan"
                          : action === "fallback_provider"
                            ? "retry_fallback"
                            : "retry_safer_mode";
                      const availability = run.recovery_recommendation?.action_availability[key];
                      const disabled = !availability?.allowed || props.runningRecoveryFor === run.id;
                      return (
                        <button
                          key={action}
                          type="button"
                          disabled={disabled}
                          title={availability?.reason ?? ""}
                          onClick={() => props.onRecoveryAction(run, action)}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs disabled:opacity-40"
                        >
                          {props.runningRecoveryFor === run.id ? "Retrying..." : actionLabel(action)}
                        </button>
                      );
                    })}
                  </div>
                  <ul className="mt-2 space-y-1 text-zinc-500">
                    <li>Same plan: {run.recovery_recommendation.action_availability.retry_same_plan.reason}</li>
                    <li>Fallback: {run.recovery_recommendation.action_availability.retry_fallback.reason}</li>
                    <li>Safer mode: {run.recovery_recommendation.action_availability.retry_safer_mode.reason}</li>
                    {run.recovery_recommendation.action_availability.improve_anchors.allowed ? (
                      <li className="text-amber-300">Improve anchors before retry.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              {run.accepted_for_sequence ? (
                <p className="mt-2 inline-block rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Accepted</p>
              ) : null}
              {runSupportsSuccessActions(run) ? (
                <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
                  <p className="font-medium text-zinc-200">Post-success actions</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={props.acceptingRunId === run.id || run.accepted_for_sequence}
                      onClick={() => props.onAcceptClip(run)}
                      className="rounded border border-emerald-600/40 px-2 py-1 disabled:opacity-40"
                    >
                      {run.accepted_for_sequence ? "Accepted" : props.acceptingRunId === run.id ? "Accepting..." : "Accept clip"}
                    </button>
                    <button
                      type="button"
                      disabled={!run.continuation_allowed}
                      title={run.continuation_allowed ? "Continue this clip from final frames." : run.continuation_block_reason ?? "Not available"}
                      onClick={() => props.onExtendClip(run)}
                      className="rounded border border-cyan-600/40 px-2 py-1 disabled:opacity-40"
                    >
                      Extend this clip
                    </button>
                    <button
                      type="button"
                      disabled={!run.accepted_for_sequence || !props.selectedSequenceId || props.addingToSequenceRunId === run.id}
                      onClick={() => props.onAddToSequence(run)}
                      className="rounded border border-violet-600/40 px-2 py-1 disabled:opacity-40"
                    >
                      {props.addingToSequenceRunId === run.id ? "Adding..." : "Add to sequence"}
                    </button>
                    <button
                      type="button"
                      disabled={props.branchingRunId === run.id}
                      onClick={() => props.onBranchRun(run)}
                      className="rounded border border-indigo-600/40 px-2 py-1 disabled:opacity-40"
                    >
                      {props.branchingRunId === run.id ? "Prefilling..." : "Create next shot"}
                    </button>
                  </div>
                  {!run.continuation_allowed ? <p className="mt-1 text-zinc-500">Extension unavailable: {run.continuation_block_reason ?? "Run not eligible"}</p> : null}
                  {!run.accepted_for_sequence ? <p className="mt-1 text-amber-300">Accept this clip before adding it to a sequence.</p> : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-zinc-500">{acceptedOnly ? "No accepted clips yet." : "No run history yet. Generate a plan and click “Run this plan”."}</p>
        )}
      </div>
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
  const [planResponse, setPlanResponse] = useState<DirectorPlanContract | null>(null);
  const [planRecord, setPlanRecord] = useState<PlanApiResponse | null>(null);
  const [runHistory, setRunHistory] = useState<VideoRunHistoryRecord[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [exactEndStateRequired, setExactEndStateRequired] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [desiredMode, setDesiredMode] = useState<"" | V2Mode>("");
  const [error, setError] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [executingRun, setExecutingRun] = useState(false);
  const [runningRecoveryFor, setRunningRecoveryFor] = useState<string | null>(null);
  const [acceptingRunId, setAcceptingRunId] = useState<string | null>(null);
  const [branchingRunId, setBranchingRunId] = useState<string | null>(null);
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
  const [addingToSequenceRunId, setAddingToSequenceRunId] = useState<string | null>(null);
  const [renderingSequence, setRenderingSequence] = useState(false);
  const [renderNote, setRenderNote] = useState<string | null>(null);

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

  async function loadRuns() {
    setLoadingRuns(true);
    const res = await fetch("/api/studio/video/v2/runs", { cache: "no-store" });
    const payload = (await res.json()) as { data?: VideoRunHistoryRecord[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load run history.");
    setRunHistory(payload.data ?? []);
    setLoadingRuns(false);
  }

  async function loadSequences() {
    const res = await fetch("/api/studio/video/v2/sequences", { cache: "no-store" });
    const payload = (await res.json()) as { data?: VideoSequence[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load sequences.");
    const data = payload.data ?? [];
    setSequences(data);
    if (!selectedSequenceId && data[0]?.id) setSelectedSequenceId(data[0].id);
  }

  async function loadSequenceTimeline(sequenceId: string) {
    if (!sequenceId) {
      setSequenceTimeline(null);
      setExportPreparation(null);
      return;
    }
    const res = await fetch(`/api/studio/video/v2/sequences/${sequenceId}`, { cache: "no-store" });
    const payload = (await res.json()) as {
      data?: { timeline?: SequenceTimelineView; export_preparation?: ExportPreparationView };
      error?: string;
    };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load sequence timeline.");
    setSequenceTimeline(payload.data?.timeline ?? null);
    setExportPreparation(payload.data?.export_preparation ?? null);
  }

  useEffect(() => {
    Promise.all([loadPacks(), loadImages(), loadValidationResults(), loadRuns(), loadSequences()]).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSequenceTimeline(selectedSequenceId).catch((e) => setError(e instanceof Error ? e.message : "Failed to load sequence timeline."));
  }, [selectedSequenceId]);

  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedPackRoles = Array.from(new Set((selectedPack?.anchor_pack_items ?? []).map((item) => item.role as AnchorPackItemRole)));
  const hasRunnablePlan = Boolean(planRecord?.id && planResponse && selectedPack?.id);

  async function runRecoveryAction(run: VideoRunHistoryRecord, action: "same_plan" | "fallback_provider" | "safer_mode") {
    try {
      setError(null);
      setRunningRecoveryFor(run.id);
      const res = await fetch("/api/studio/video/v2/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_run_id: run.id,
          retry_strategy: action,
          retry_reason: `Operator-triggered ${actionLabel(action).toLowerCase()}.`,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Recovery retry failed.");
      await Promise.all([loadRuns(), loadValidationResults()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recovery retry failed.");
    } finally {
      setRunningRecoveryFor(null);
    }
  }

  async function acceptClip(run: VideoRunHistoryRecord) {
    try {
      setError(null);
      setAcceptingRunId(run.id);
      const res = await fetch("/api/studio/video/v2/runs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          run_id: run.id,
          action_type: "accept",
          accepted_for_sequence: true,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to accept clip.");
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept clip.");
    } finally {
      setAcceptingRunId(null);
    }
  }

  async function createNextShot(run: VideoRunHistoryRecord) {
    try {
      setError(null);
      setBranchingRunId(run.id);
      const res = await fetch("/api/studio/video/v2/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_run_id: run.id,
          action_type: "branch",
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        data?: {
          planner_prefill?: {
            selected_pack_id?: string | null;
            suggested_motion_request?: string | null;
            suggested_mode?: V2Mode;
            aspect_ratio?: string;
          };
          lineage_meta?: { branched_from_run_id?: string; branch_type?: "next_shot" };
        };
      };
      if (!res.ok) throw new Error(payload.error ?? "Failed to prefill next shot.");
      if (payload.data?.planner_prefill?.selected_pack_id) setSelectedPackId(payload.data.planner_prefill.selected_pack_id);
      if (payload.data?.planner_prefill?.suggested_motion_request) setMotionRequest(String(payload.data.planner_prefill.suggested_motion_request));
      if (payload.data?.planner_prefill?.suggested_mode) setDesiredMode(payload.data.planner_prefill.suggested_mode);
      if (payload.data?.planner_prefill?.aspect_ratio) setAspectRatio(String(payload.data.planner_prefill.aspect_ratio));
      if (payload.data?.lineage_meta?.branched_from_run_id) {
        setPendingBranchMeta({ branched_from_run_id: payload.data.lineage_meta.branched_from_run_id, branch_type: "next_shot" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to prefill next shot.");
    } finally {
      setBranchingRunId(null);
    }
  }

  async function runExtension() {
    if (!extendSourceRun) return;
    try {
      setError(null);
      setExtendingRun(true);
      const res = await fetch("/api/studio/video/v2/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_run_id: extendSourceRun.id,
          action_type: "extend",
          continuation_prompt: continuationPrompt.trim(),
          duration_seconds: continuationDuration,
          new_seed: continuationSeed.trim() ? Number(continuationSeed) : undefined,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to extend clip.");
      setExtendSourceRun(null);
      setContinuationPrompt("");
      setContinuationSeed("");
      await Promise.all([loadRuns(), loadValidationResults()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extend clip.");
    } finally {
      setExtendingRun(false);
    }
  }

  async function createSequence() {
    try {
      setError(null);
      const res = await fetch("/api/studio/video/v2/sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sequence_name: sequenceName }),
      });
      const payload = (await res.json()) as { data?: VideoSequence; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to create sequence.");
      setSequenceName("");
      await loadSequences();
      if (payload.data?.id) setSelectedSequenceId(payload.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create sequence.");
    }
  }

  async function addRunToSequence(run: VideoRunHistoryRecord) {
    if (!selectedSequenceId) return setError("Choose a target sequence first.");
    if (!run.accepted_for_sequence) return setError("Only accepted clips can be added to a sequence.");

    try {
      setError(null);
      setAddingToSequenceRunId(run.id);
      const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: run.id }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to add clip to sequence.");
      await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add clip to sequence.");
    } finally {
      setAddingToSequenceRunId(null);
    }
  }

  async function exportSequence() {
    if (!selectedSequenceId || !exportPreparation?.ready_for_export) return;
    try {
      setError(null);
      setRenderNote(null);
      setRenderingSequence(true);
      const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = (await res.json()) as { data?: { message?: string }; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Rendering failed — check clips");
      if (payload.data?.message) setRenderNote(payload.data.message);
      await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rendering failed — check clips");
    } finally {
      setRenderingSequence(false);
    }
  }

  async function moveSequenceItem(itemId: string, direction: "move_up" | "move_down") {
    if (!selectedSequenceId) return;
    const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/items`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: direction, item_id: itemId }),
    });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to reorder sequence item.");
    await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]);
  }

  async function removeSequenceItem(itemId: string) {
    if (!selectedSequenceId) return;
    const res = await fetch(`/api/studio/video/v2/sequences/${selectedSequenceId}/items/${itemId}`, { method: "DELETE" });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to remove sequence item.");
    await Promise.all([loadSequences(), loadSequenceTimeline(selectedSequenceId)]);
  }

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
              const payload = (await res.json()) as { error?: string; plan?: DirectorPlanContract; data?: PlanApiResponse };
              if (!res.ok) return setError(payload.error ?? "Planning failed.");
              setPlanResponse(payload.plan ?? null);
              setPlanRecord(payload.data ?? null);
            }}
          >
            Generate plan contract
          </button>
          <button
            disabled={!hasRunnablePlan || executingRun}
            className="w-fit rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 disabled:opacity-40"
            onClick={async () => {
              if (!hasRunnablePlan || !planRecord?.id || !selectedPack?.id || !planResponse) return;
              setExecutingRun(true);
              setError(null);
              const providerSelected = planResponse.provider_order?.[0] ?? "veo-3.1";
              const requestPayloadSnapshot = {
                selected_pack_id: selectedPack.id,
                mode_selected: planResponse.mode_selected,
                provider_selected: providerSelected,
                model_selected: providerSelected,
                director_prompt: planResponse.director_prompt,
                fallback_prompt: planResponse.fallback_prompt,
                aspect_ratio: planResponse.aspect_ratio ?? aspectRatio,
                duration_seconds: planResponse.duration_seconds ?? 8,
              } satisfies Record<string, unknown>;

              const body: ExecuteVideoRunRequest = {
                generation_plan_id: planRecord.id,
                selected_pack_id: selectedPack.id,
                mode_selected: planResponse.mode_selected,
                provider_selected: providerSelected,
                model_selected: providerSelected,
                director_prompt: planResponse.director_prompt,
                fallback_prompt: planResponse.fallback_prompt,
                aspect_ratio: planResponse.aspect_ratio ?? aspectRatio,
                duration_seconds: planResponse.duration_seconds ?? 8,
                request_payload_snapshot: requestPayloadSnapshot,
                action_type: pendingBranchMeta ? "branch" : undefined,
                lineage_meta: pendingBranchMeta ?? undefined,
              };

              const res = await fetch("/api/studio/video/v2/runs", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              });
              const payload = (await res.json()) as { error?: string };
              if (!res.ok) {
                setExecutingRun(false);
                return setError(payload.error ?? "Run creation failed.");
              }
              await Promise.all([loadRuns(), loadValidationResults()]);
              setPendingBranchMeta(null);
              setExecutingRun(false);
            }}
          >
            {executingRun ? "Running..." : "Run this plan"}
          </button>
          {!hasRunnablePlan ? <p className="text-xs text-zinc-500">Generate a plan contract with a selected pack before execution.</p> : null}
          {pendingBranchMeta ? <p className="text-xs text-indigo-300">Next run will be stored as branched from {shortId(pendingBranchMeta.branched_from_run_id)}.</p> : null}
          {planResponse ? (
            <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">{JSON.stringify(planResponse, null, 2)}</pre>
          ) : null}
        </section>

        <RunHistoryPanel
          runs={runHistory}
          sequences={sequences}
          selectedSequenceId={selectedSequenceId}
          onSelectSequence={setSelectedSequenceId}
          loading={loadingRuns}
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
          runningRecoveryFor={runningRecoveryFor}
          acceptingRunId={acceptingRunId}
          branchingRunId={branchingRunId}
          addingToSequenceRunId={addingToSequenceRunId}
        />

        <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="font-medium">Sequence Timeline Preparation</h2>
          <p className="text-xs text-zinc-400">Organize accepted clips into ordered sequence references ready for downstream stitching/export.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Sequence name"
              value={sequenceName}
              onChange={(event) => setSequenceName(event.target.value)}
            />
            <button type="button" onClick={createSequence} className="rounded bg-violet-500 px-3 py-2 text-sm font-medium text-violet-950">
              Create sequence
            </button>
            <select
              className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={selectedSequenceId}
              onChange={(event) => setSelectedSequenceId(event.target.value)}
            >
              <option value="">-- Select sequence --</option>
              {sequences.map((sequence) => (
                <option key={sequence.id} value={sequence.id}>
                  {sequence.sequence_name} · {sequence.clip_count ?? 0} clips · {sequence.status}
                </option>
              ))}
            </select>
          </div>

          {sequenceTimeline ? (
            <div className="space-y-3">
              <div className="rounded border border-zinc-800 p-3 text-xs text-zinc-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>Name: {sequenceTimeline.sequence.sequence_name}</p>
                  <span className={`rounded border border-zinc-700 px-2 py-1 text-xs font-medium uppercase ${sequenceStatusTone(sequenceTimeline.sequence.status)}`}>
                    {sequenceStatusLabel(sequenceTimeline.sequence.status)}
                  </span>
                </div>
                <p>Status: {sequenceTimeline.sequence.status}</p>
                <p>Updated: {new Date(sequenceTimeline.sequence.updated_at).toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                {sequenceTimeline.clips.map((clip, index) => (
                  <div key={clip.item_id} className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">Clip {clip.order_index + 1} · run {shortId(clip.run_id)}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveSequenceItem(clip.item_id, "move_up").catch((e) => setError(String(e)))}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === sequenceTimeline.clips.length - 1}
                          onClick={() => moveSequenceItem(clip.item_id, "move_down").catch((e) => setError(String(e)))}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSequenceItem(clip.item_id).catch((e) => setError(String(e)))}
                          className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-3">
                      <div className="h-16 w-24 overflow-hidden rounded bg-zinc-900">
                        {clip.thumbnail_url || clip.output_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={clip.thumbnail_url ?? clip.output_url ?? undefined} alt={`Clip ${clip.order_index + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">No preview</div>
                        )}
                      </div>
                      <div className="grid flex-1 gap-1 text-xs text-zinc-400 md:grid-cols-2">
                        <p>Duration: <span className="text-zinc-200">{clip.duration_seconds ?? "n/a"}s</span></p>
                        <p>Mode: <span className="text-zinc-200">{clip.mode_selected}</span></p>
                        <p>Provider/model: <span className="text-zinc-200">{clip.provider_used ?? "n/a"} / {clip.provider_model ?? "n/a"}</span></p>
                        <p>Validation: <span className="text-zinc-200">{clip.validation_score?.toFixed(2) ?? "n/a"}</span></p>
                        {clip.lineage.extension_from_run_id ? <p className="text-cyan-300">Extended from {shortId(clip.lineage.extension_from_run_id)}</p> : null}
                        {clip.lineage.branched_from_run_id ? <p className="text-indigo-300">Branched from {shortId(clip.lineage.branched_from_run_id)}</p> : null}
                      </div>
                    </div>
                    {index < sequenceTimeline.clips.length - 1 ? <p className="mt-2 text-center text-xs text-zinc-500">→</p> : null}
                  </div>
                ))}
                {!sequenceTimeline.clips.length ? <p className="text-sm text-zinc-500">No clips in this sequence yet.</p> : null}
              </div>
              {sequenceTimeline.continuity.length ? (
                <div className="space-y-2 rounded border border-zinc-800 p-3">
                  <h3 className="text-sm font-medium">Continuity guidance</h3>
                  {sequenceTimeline.continuity.map((pair) => (
                    <div key={`${pair.from_run_id}-${pair.to_run_id}`} className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-xs">
                      <p className={`font-medium ${continuityTone(pair.overall)}`}>
                        {continuityIcon(pair.overall)} {shortId(pair.from_run_id)} → {shortId(pair.to_run_id)}
                      </p>
                      <ul className="mt-1 space-y-1 text-zinc-400">
                        {pair.signals.map((signal) => (
                          <li key={signal.signal} className={continuityTone(signal.status)}>
                            {continuityIcon(signal.status)} {signal.label}: {signal.details}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
              {exportPreparation ? (
                <div className="rounded border border-violet-700/40 bg-violet-950/20 p-3 text-xs">
                  <p className="font-medium text-violet-200">Export preparation</p>
                  <p className="mt-1 text-zinc-200">Total duration: {exportPreparation.total_duration.toFixed(1)}s</p>
                  <p className={exportPreparation.ready_for_export ? "text-emerald-300" : "text-amber-300"}>
                    Ready for export: {exportPreparation.ready_for_export ? "yes" : "no"}
                  </p>
                  {exportPreparation.issues.length ? (
                    <ul className="mt-1 list-disc pl-4 text-amber-200">
                      {exportPreparation.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded bg-violet-400 px-3 py-2 text-xs font-semibold text-violet-950 disabled:opacity-40"
                      disabled={!exportPreparation.ready_for_export || renderingSequence || sequenceTimeline.sequence.status === "rendering"}
                      onClick={exportSequence}
                    >
                      {renderingSequence || sequenceTimeline.sequence.status === "rendering" ? "Rendering..." : "Export sequence"}
                    </button>
                    {renderNote ? <p className="text-amber-200">{renderNote}</p> : null}
                    {sequenceTimeline.sequence.status === "failed" ? <p className="text-rose-300">Rendering failed — check clips</p> : null}
                  </div>
                  {sequenceTimeline.sequence.output_url ? (
                    <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 p-2">
                      <p className="mb-2 text-[11px] text-emerald-200">Exported output preview</p>
                      <video src={sequenceTimeline.sequence.output_url} controls className="max-h-72 w-full rounded" />
                      <a
                        href={sequenceTimeline.sequence.output_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block rounded border border-emerald-500/50 px-2 py-1 text-[11px] text-emerald-200"
                      >
                        Download exported video
                      </a>
                    </div>
                  ) : null}
                  <pre className="mt-2 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px]">{JSON.stringify(exportPreparation, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Select a sequence to view timeline details.</p>
          )}
        </section>

        {extendSourceRun ? (
          <section className="rounded border border-cyan-700/40 bg-cyan-950/20 p-4">
            <h2 className="font-medium text-cyan-100">Extend this clip</h2>
            <p className="mt-1 text-xs text-cyan-200/80">
              Source run {shortId(extendSourceRun.id)} · model {extendSourceRun.provider_model ?? "n/a"} · provider {extendSourceRun.provider_used ?? "n/a"}
            </p>
            <p className="text-xs text-cyan-200/80">Pack {extendSourceRun.selected_pack_name ?? extendSourceRun.selected_pack_id ?? "unknown"}.</p>
            <textarea
              className="mt-3 min-h-24 w-full rounded border border-cyan-700/50 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Describe how this clip should continue from its final frames…"
              value={continuationPrompt}
              onChange={(event) => setContinuationPrompt(event.target.value)}
            />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-zinc-300">
                Duration seconds (4-7 recommended)
                <input
                  type="number"
                  min={4}
                  max={8}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={continuationDuration}
                  onChange={(event) => setContinuationDuration(Number(event.target.value || 6))}
                />
              </label>
              <label className="space-y-1 text-xs text-zinc-300">
                Optional seed
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={continuationSeed}
                  onChange={(event) => setContinuationSeed(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!continuationPrompt.trim() || extendingRun}
                onClick={runExtension}
                className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-cyan-950 disabled:opacity-40"
              >
                {extendingRun ? "Extending..." : "Start extension run"}
              </button>
              <button
                type="button"
                disabled={extendingRun}
                onClick={() => setExtendSourceRun(null)}
                className="rounded border border-zinc-700 px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

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
