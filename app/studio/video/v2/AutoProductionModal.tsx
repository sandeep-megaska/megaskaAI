"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AutoProductionControlMode, AutoProductionProgress } from "@/lib/video/v2/types";

type ModelOption = { id: string; display_name: string };
type GarmentOption = { id: string; display_name: string };

type PreviewData = NonNullable<AutoProductionProgress["preview"]>;

type Props = {
  open: boolean;
  onClose: () => void;
  models: ModelOption[];
  garments: GarmentOption[];
};

const CONTROL_MODES: AutoProductionControlMode[] = ["safe", "balanced", "creative"];

export default function AutoProductionModal({ open, onClose, models, garments }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState("");
  const [garmentId, setGarmentId] = useState("");
  const [scene, setScene] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [controlMode, setControlMode] = useState<AutoProductionControlMode>("balanced");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<AutoProductionProgress | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/studio/video/v2/auto-produce/${jobId}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        success?: boolean;
        data?: { status: string; progress: AutoProductionProgress; sequence_id: string | null; output_url: string | null };
        error?: string;
      };
      if (!res.ok || !payload.success || !payload.data) {
        setError(payload.error ?? "Failed to poll auto production job.");
        return;
      }
      setStatus(payload.data.status);
      setProgress(payload.data.progress);
      setSequenceId(payload.data.sequence_id);
      setOutputUrl(payload.data.output_url);

      if (payload.data.status === "completed") {
        setStep(4);
        clearInterval(timer);
      }
      if (payload.data.status === "failed") {
        setError(payload.data.progress.error ?? "Auto production failed.");
        clearInterval(timer);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [jobId, open]);

  const canPreview = useMemo(() => prompt.trim().length > 10, [prompt]);

  async function generatePreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/video/v2/auto-produce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          model_id: modelId || undefined,
          garment_id: garmentId || undefined,
          scene: scene || undefined,
          aspect_ratio: aspectRatio,
          control_mode: controlMode,
          preview_only: true,
        }),
      });
      const payload = (await res.json()) as { success?: boolean; data?: { preview?: PreviewData }; error?: string };
      if (!res.ok || !payload.success || !payload.data?.preview) throw new Error(payload.error ?? "Failed to create preview.");
      setPreview(payload.data.preview);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create preview.");
    } finally {
      setLoading(false);
    }
  }

  async function proceedAutoProduction() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/video/v2/auto-produce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          model_id: modelId || undefined,
          garment_id: garmentId || undefined,
          scene: scene || undefined,
          aspect_ratio: aspectRatio,
          control_mode: controlMode,
        }),
      });
      const payload = (await res.json()) as {
        success?: boolean;
        data?: { job_id: string; status: string; preview?: PreviewData };
        error?: string;
      };
      if (!res.ok || !payload.success || !payload.data?.job_id) throw new Error(payload.error ?? "Failed to start auto production.");
      setJobId(payload.data.job_id);
      setStatus(payload.data.status);
      if (payload.data.preview) setPreview(payload.data.preview);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start auto production.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl space-y-4 rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-zinc-100">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Auto Produce Video</h2>
          <button type="button" onClick={onClose} className="rounded border border-zinc-700 px-2 py-1 text-xs">Close</button>
        </div>

        {error ? <p className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{error}</p> : null}

        {step === 1 ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span>Idea prompt</span>
              <textarea className="min-h-24 w-full rounded border border-zinc-700 bg-zinc-900 p-2" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Model</span>
                <select className="w-full rounded border border-zinc-700 bg-zinc-900 p-2" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                  <option value="">Auto select</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Garment</span>
                <select className="w-full rounded border border-zinc-700 bg-zinc-900 p-2" value={garmentId} onChange={(e) => setGarmentId(e.target.value)}>
                  <option value="">Auto select</option>
                  {garments.map((garment) => <option key={garment.id} value={garment.id}>{garment.display_name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Scene (optional)</span>
                <input className="w-full rounded border border-zinc-700 bg-zinc-900 p-2" value={scene} onChange={(e) => setScene(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span>Aspect ratio</span>
                <select className="w-full rounded border border-zinc-700 bg-zinc-900 p-2" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                </select>
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span>Control mode</span>
              <select className="w-full rounded border border-zinc-700 bg-zinc-900 p-2" value={controlMode} onChange={(e) => setControlMode(e.target.value as AutoProductionControlMode)}>
                {CONTROL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>
            <button disabled={!canPreview || loading} onClick={generatePreview} className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
              {loading ? "Loading..." : "Preview plan"}
            </button>
          </div>
        ) : null}

        {step === 2 && preview ? (
          <div className="space-y-3 text-sm">
            <h3 className="font-medium">Plan Preview</h3>
            <p>Estimated duration: <span className="text-zinc-300">{preview.estimated_duration}s</span></p>
            <p>Risk level: <span className="text-zinc-300">{preview.risk_level}</span></p>
            <p className="text-xs text-zinc-400">
              Selected packs: identity {preview.selected_packs.identity_pack_id?.slice(0, 8) ?? "n/a"}, garment {preview.selected_packs.garment_pack_id?.slice(0, 8) ?? "n/a"}, scene {preview.selected_packs.scene_pack_id?.slice(0, 8) ?? "n/a"}
            </p>
            <ul className="space-y-1 rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs">
              {preview.shots.map((shot) => (
                <li key={shot.shot_index}>Shot {shot.shot_index}: {shot.description} ({shot.duration}s · {shot.motion_type})</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={proceedAutoProduction} disabled={loading} className="rounded bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">Proceed</button>
              <button onClick={() => setStep(1)} className="rounded border border-zinc-700 px-3 py-2 text-sm">Edit</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3 text-sm">
            <h3 className="font-medium">Execution</h3>
            <p className="text-xs text-zinc-400">Job: {jobId?.slice(0, 8)} · status: {status}</p>
            <ul className="space-y-1 rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs">
              {(progress?.steps ?? []).map((item) => (
                <li key={item.key}>
                  {item.status === "completed" ? "✓" : item.status === "running" ? "⏳" : item.status === "failed" ? "✕" : "•"} {item.label}
                  {item.note ? ` — ${item.note}` : ""}
                </li>
              ))}
            </ul>
            {progress?.shot_logs?.length ? (
              <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs">
                {progress.shot_logs.slice(-5).map((log) => <p key={log}>{log}</p>)}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3 text-sm">
            <h3 className="font-medium">Result</h3>
            {outputUrl ? (
              <>
                <video src={outputUrl} controls className="w-full rounded border border-zinc-800" />
                <div className="flex flex-wrap gap-2">
                  <a href={outputUrl} download className="rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950">Download</a>
                  {sequenceId ? <Link href={`/studio/video/v2#sequence-${sequenceId}`} className="rounded border border-zinc-700 px-3 py-2 text-xs">Open Sequence</Link> : null}
                </div>
              </>
            ) : (
              <p className="text-zinc-400">Final output URL unavailable.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
