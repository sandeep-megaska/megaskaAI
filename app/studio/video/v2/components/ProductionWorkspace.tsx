"use client";

import { type DirectorPlanContract, type V2Mode, V2_MODE_OPTIONS, type VideoRunHistoryRecord } from "@/lib/video/v2/types";
import DownloadAssetButton from "@/app/studio/video/v2/components/DownloadAssetButton";
import { excerpt, resolveRunVideoUrl, shortId, statusTone } from "@/app/studio/video/v2/components/helpers";

type PlanApiResponse = {
  id?: string;
};

export default function ProductionWorkspace(props: {
  activeTab: "manual" | "auto";
  setActiveTab: (tab: "manual" | "auto") => void;
  motionRequest: string;
  setMotionRequest: (value: string) => void;
  exactEndStateRequired: boolean;
  setExactEndStateRequired: (value: boolean) => void;
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  desiredMode: "" | V2Mode;
  setDesiredMode: (mode: "" | V2Mode) => void;
  onGeneratePlan: () => Promise<void>;
  onRunPlan: () => Promise<void>;
  planResponse: DirectorPlanContract | null;
  planRecord: PlanApiResponse | null;
  hasRunnablePlan: boolean;
  packReadyForPlan: boolean;
  blockedPlanReason: string | null;
  executingRun: boolean;
  pendingBranchLabel: string | null;
  onOpenAuto: () => void;
  latestRun: VideoRunHistoryRecord | null;
  showingOlderRun: boolean;
  selectedPackName: string | null;
  onClearCurrentResult: () => void;
  onRecoveryAction: (run: VideoRunHistoryRecord, action: "same_plan" | "fallback_provider" | "safer_mode") => Promise<void>;
  onAcceptClip: (run: VideoRunHistoryRecord) => Promise<void>;
  onExtendClip: (run: VideoRunHistoryRecord) => void;
  onBranchRun: (run: VideoRunHistoryRecord) => Promise<void>;
  onAddToSequence: (run: VideoRunHistoryRecord) => Promise<void>;
  selectedSequenceId: string;
}) {
  const resolvedVideoUrl = resolveRunVideoUrl(props.latestRun);
  const canShowVideo = Boolean(props.latestRun && resolvedVideoUrl && (props.latestRun.status === "succeeded" || props.latestRun.status === "validated" || props.latestRun.status === "completed"));

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Production Workspace</h2>
            <p className="text-xs text-zinc-400">Plan → Run → Act on result.</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-1 text-sm">
            <button className={`rounded-lg px-3 py-1 ${props.activeTab === "manual" ? "bg-zinc-800" : "text-zinc-400"}`} onClick={() => props.setActiveTab("manual")}>Manual Production</button>
            <button className={`rounded-lg px-3 py-1 ${props.activeTab === "auto" ? "bg-zinc-800" : "text-zinc-400"}`} onClick={() => props.setActiveTab("auto")}>Auto Production</button>
          </div>
        </div>

        {props.activeTab === "manual" ? (
          <div className="mt-4 space-y-3">
            <textarea className="min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={props.motionRequest} onChange={(e) => props.setMotionRequest(e.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={props.aspectRatio} onChange={(e) => props.setAspectRatio(e.target.value)} />
              <select className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={props.desiredMode} onChange={(e) => props.setDesiredMode(e.target.value as "" | V2Mode)}>
                <option value="">-- let planner decide --</option>
                {V2_MODE_OPTIONS.map((mode) => <option key={mode} value={mode}>{mode === "frames_to_video" ? "frames_to_video (recommended for anchor-first)" : mode === "ingredients_to_video" ? "ingredients_to_video (prompt-led / less stable)" : "scene_extension (continue validated clips)"}</option>)}
              </select>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-xs text-zinc-400">
              <p>Mode guidance: <span className="text-zinc-200">frames_to_video</span> is recommended for anchor-first production and controlled transitions.</p>
              <p><span className="text-zinc-200">ingredients_to_video</span> is more prompt-led and can be less stable.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={props.exactEndStateRequired} onChange={(e) => props.setExactEndStateRequired(e.target.checked)} /> exact_end_state_required
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!props.packReadyForPlan} onClick={() => props.onGeneratePlan()} className="rounded bg-violet-500 px-3 py-2 text-sm font-medium text-violet-950 disabled:opacity-40">Generate Plan</button>
              <button type="button" disabled={!props.hasRunnablePlan || props.executingRun || !props.packReadyForPlan} onClick={() => props.onRunPlan()} className="rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 disabled:opacity-40">
                {props.executingRun ? "Running..." : "Run this plan"}
              </button>
            </div>
            {!props.packReadyForPlan && props.blockedPlanReason ? <p className="text-xs text-amber-300">{props.blockedPlanReason}</p> : null}
            {props.pendingBranchLabel ? <p className="text-xs text-indigo-300">{props.pendingBranchLabel}</p> : null}
            {props.planResponse ? <pre className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs">{JSON.stringify(props.planResponse, null, 2)}</pre> : null}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-sm text-zinc-300">Auto Production is available for fast default pipelines.</p>
            <button type="button" onClick={props.onOpenAuto} className="mt-3 rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Launch Auto Production</button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Last run result</h3>
          {props.latestRun ? <button type="button" onClick={props.onClearCurrentResult} className="rounded border border-zinc-700 px-2 py-1 text-xs">Clear current result</button> : null}
        </div>
        {props.latestRun ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className={`font-medium uppercase ${statusTone(props.latestRun.status)}`}>{props.latestRun.status}</p>
            <p className="text-xs text-zinc-500">{new Date(props.latestRun.created_at).toLocaleString()}</p>
            {props.showingOlderRun ? <p className="rounded border border-amber-500/40 bg-amber-950/20 p-2 text-xs text-amber-200">Showing a result from a different pack than currently selected ({props.selectedPackName ?? "current pack"}).</p> : null}
            <p className="text-zinc-400">Run {shortId(props.latestRun.id)} · {excerpt((props.latestRun.request_payload_snapshot?.director_prompt as string | undefined) ?? "", 80)}</p>
            {canShowVideo ? (
              <div className="space-y-2">
                <video controls width="100%" className="w-full rounded-xl border border-zinc-800 bg-black">
                  <source src={resolvedVideoUrl ?? undefined} type="video/mp4" />
                </video>
                <div className="flex flex-wrap gap-2">
                  <DownloadAssetButton url={resolvedVideoUrl ?? ""} filenamePrefix={`run-${shortId(props.latestRun.id)}-output`} />
                  <a href={resolvedVideoUrl ?? undefined} target="_blank" rel="noreferrer" className="rounded border border-zinc-700 px-2 py-1 text-xs">
                    Open in new tab
                  </a>
                  {(() => {
                    const run = props.latestRun;
                    return (
                      <>
                        <button type="button" onClick={() => props.onAcceptClip(run)} className="rounded border border-emerald-600/40 px-2 py-1 text-xs">Accept</button>
                        <button type="button" onClick={() => props.onRecoveryAction(run, "same_plan")} className="rounded border border-zinc-700 px-2 py-1 text-xs">Retry</button>
                        <button type="button" onClick={() => props.onRecoveryAction(run, "fallback_provider")} className="rounded border border-zinc-700 px-2 py-1 text-xs">Fallback</button>
                        <button type="button" onClick={() => props.onRecoveryAction(run, "safer_mode")} className="rounded border border-zinc-700 px-2 py-1 text-xs">Safer mode</button>
                        <button type="button" onClick={() => props.onExtendClip(run)} className="rounded border border-cyan-600/40 px-2 py-1 text-xs">Extend</button>
                        <button type="button" onClick={() => props.onBranchRun(run)} className="rounded border border-indigo-600/40 px-2 py-1 text-xs">Branch</button>
                        <button type="button" disabled={!props.selectedSequenceId} onClick={() => props.onAddToSequence(run)} className="rounded border border-violet-600/40 px-2 py-1 text-xs disabled:opacity-40">Add to sequence</button>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : props.latestRun.status === "succeeded" ? <p className="text-xs text-amber-300">Run succeeded but no video URL was resolved.</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No run output yet.</p>
        )}
      </div>
    </section>
  );
}
