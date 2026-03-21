"use client";

import DownloadAssetButton from "@/app/studio/video/v2/components/DownloadAssetButton";
import { sequenceStatusLabel, sequenceStatusTone, shortId, statusTone } from "@/app/studio/video/v2/components/helpers";
import { type ExportPreparationView, type SequenceTimelineView, type VideoRunHistoryRecord, type VideoSequence } from "@/lib/video/v2/types";

type ValidationResult = {
  id: string;
  overall_score: number;
  decision: "pass" | "retry" | "reject" | "manual_review";
  failure_reasons?: string[];
};

export default function ProductionIntelligencePanel(props: {
  runs: VideoRunHistoryRecord[];
  loadingRuns: boolean;
  validationResults: ValidationResult[];
  sequences: VideoSequence[];
  selectedSequenceId: string;
  setSelectedSequenceId: (id: string) => void;
  sequenceTimeline: SequenceTimelineView | null;
  exportPreparation: ExportPreparationView | null;
  renderNote: string | null;
  renderingSequence: boolean;
  onExportSequence: () => Promise<void>;
  onMoveSequenceItem: (itemId: string, direction: "move_up" | "move_down") => Promise<void>;
  onRemoveSequenceItem: (itemId: string) => Promise<void>;
}) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="font-semibold">Run History</h3>
        <div className="mt-2 max-h-72 space-y-2 overflow-auto text-xs">
          {props.loadingRuns ? <p className="text-zinc-500">Loading…</p> : null}
          {props.runs.slice(0, 8).map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
              <p className={`font-medium uppercase ${statusTone(run.status)}`}>{run.status}</p>
              <p className="text-zinc-300">{shortId(run.id)} · {new Date(run.created_at).toLocaleTimeString()}</p>
              <p className="text-zinc-500">{run.provider_used ?? "n/a"} / {run.provider_model ?? "n/a"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="font-semibold">Validation Insights</h3>
        <div className="mt-2 space-y-2 text-xs">
          {props.validationResults.slice(0, 4).map((entry) => (
            <div key={entry.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
              <p>Score {Number(entry.overall_score ?? 0).toFixed(2)} · <span className="font-semibold">{entry.decision}</span></p>
              {entry.failure_reasons?.length ? <p className="text-rose-300">{entry.failure_reasons.join(" | ")}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="font-semibold">Sequence Builder Summary</h3>
        <select className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs" value={props.selectedSequenceId} onChange={(e) => props.setSelectedSequenceId(e.target.value)}>
          <option value="">-- Select sequence --</option>
          {props.sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.sequence_name} · {sequence.clip_count ?? 0}</option>)}
        </select>
        {props.sequenceTimeline ? (
          <div className="mt-2 space-y-2 text-xs">
            <p className={`font-medium ${sequenceStatusTone(props.sequenceTimeline.sequence.status)}`}>{sequenceStatusLabel(props.sequenceTimeline.sequence.status)}</p>
            <p className="text-zinc-400">Accepted clips only are sequence-eligible.</p>
            {props.sequenceTimeline.clips.slice(0, 3).map((clip, index) => (
              <div key={clip.item_id} className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                <div className="flex items-center justify-between">
                  <p>#{index + 1} {shortId(clip.run_id)}</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => props.onMoveSequenceItem(clip.item_id, "move_up")} className="rounded border border-zinc-700 px-1">↑</button>
                    <button type="button" onClick={() => props.onMoveSequenceItem(clip.item_id, "move_down")} className="rounded border border-zinc-700 px-1">↓</button>
                    <button type="button" onClick={() => props.onRemoveSequenceItem(clip.item_id)} className="rounded border border-rose-500/40 px-1 text-rose-300">x</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="font-semibold">Render / Export</h3>
        {props.exportPreparation ? (
          <div className="mt-2 space-y-2 text-xs">
            <p>Total duration: {props.exportPreparation.total_duration.toFixed(1)}s</p>
            <p className={props.exportPreparation.ready_for_export ? "text-emerald-300" : "text-amber-300"}>Ready: {props.exportPreparation.ready_for_export ? "yes" : "no"}</p>
            <button type="button" disabled={!props.exportPreparation.ready_for_export || props.renderingSequence} onClick={() => props.onExportSequence()} className="rounded bg-violet-400 px-2 py-1 font-semibold text-violet-950 disabled:opacity-40">{props.renderingSequence ? "Rendering..." : "Export sequence"}</button>
            {props.renderNote ? <p className="text-amber-200">{props.renderNote}</p> : null}
            {props.sequenceTimeline?.sequence.output_url ? (
              <div className="space-y-2">
                <video src={props.sequenceTimeline.sequence.output_url} controls className="w-full rounded" />
                <DownloadAssetButton url={props.sequenceTimeline.sequence.output_url} filenamePrefix={`sequence-${shortId(props.sequenceTimeline.sequence.id)}-export`} label="Download exported video" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Select a sequence to view export readiness.</p>
        )}
      </section>
    </aside>
  );
}
