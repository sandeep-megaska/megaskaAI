"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  classifyMotionRiskFromActionPrompt,
  getFidelityPriorityLabel,
  getMotionPresetLabel,
  getVideoGoalLabel,
  getVideoInputModeLabel,
  VIDEO_ANCHORED_SAFE_MOTION_PRESETS,
  VIDEO_DURATIONS,
  VIDEO_EXPERIMENTAL_MOTION_PRESETS,
  VIDEO_FIDELITY_PRIORITIES,
  VIDEO_GOALS,
  VIDEO_INPUT_MODES,
  VIDEO_MOTION_STRENGTHS,
  VIDEO_REFERENCE_TAGS,
  VIDEO_STYLES,
  VIDEO_STRICT_SAFE_MOTION_PRESETS,
  type MotionRiskLevel,
  type VideoDurationSeconds,
  type VideoFidelityPriority,
  type VideoGoal,
  type VideoInputMode,
  type VideoMotionPreset,
  type VideoMotionStrength,
} from "@/lib/video/promptBuilder";

const VIDEO_ASPECT_RATIO_OPTIONS = ["16:9", "9:16"] as const;
type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIO_OPTIONS)[number];
type AnchorSlot = "identity" | "garment" | "fit" | "first" | "last";

type AIBackend = {
  id: string;
  name: string;
  type: "image" | "video";
  model: string;
};

type GalleryImageItem = {
  id: string;
  prompt: string;
  asset_url?: string | null;
  url?: string | null;
};

type FrameSelection = {
  sourceGenerationId: string | null;
  imageUrl: string;
  label: string;
};

type ReferenceSelection = FrameSelection & {
  tag?: (typeof VIDEO_REFERENCE_TAGS)[number] | null;
};

type VideoResult = {
  generationId: string;
  outputUrl: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  motionStrength: VideoMotionStrength;
  motionRiskLevel?: MotionRiskLevel;
  compatibilityWarnings?: string[];
  createdAt: string;
};

function getPresetOptions(priority: VideoFidelityPriority): readonly VideoMotionPreset[] {
  if (priority === "maximum-fidelity") return VIDEO_STRICT_SAFE_MOTION_PRESETS;
  if (priority === "maximum-motion") return [...VIDEO_ANCHORED_SAFE_MOTION_PRESETS, ...VIDEO_EXPERIMENTAL_MOTION_PRESETS];
  return VIDEO_ANCHORED_SAFE_MOTION_PRESETS;
}

export default function VideoProjectPage() {
  const [backends, setBackends] = useState<AIBackend[]>([]);
  const [selectedBackendId, setSelectedBackendId] = useState("");
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [inputMode, setInputMode] = useState<VideoInputMode>("anchor-based");
  const [videoGoal, setVideoGoal] = useState<VideoGoal>("subtle-motion");
  const [fidelityPriority, setFidelityPriority] = useState<VideoFidelityPriority>("maximum-fidelity");

  const [identityAnchor, setIdentityAnchor] = useState<FrameSelection | null>(null);
  const [garmentAnchor, setGarmentAnchor] = useState<FrameSelection | null>(null);
  const [fitAnchor, setFitAnchor] = useState<FrameSelection | null>(null);
  const [firstFrame, setFirstFrame] = useState<FrameSelection | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameSelection | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceSelection[]>([]);
  const [uploadSlot, setUploadSlot] = useState<AnchorSlot>("fit");

  const [motionPreset, setMotionPreset] = useState<VideoMotionPreset>("subtle-breathing");
  const [duration, setDuration] = useState<VideoDurationSeconds>(8);
  const [motionStrength, setMotionStrength] = useState<VideoMotionStrength>("subtle");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [actionPrompt, setActionPrompt] = useState("");
  const [styleHint, setStyleHint] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<VideoResult | null>(null);
  const [history, setHistory] = useState<VideoResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const videoBackends = useMemo(() => backends.filter((backend) => backend.type === "video"), [backends]);
  const motionRiskLevel = useMemo(() => classifyMotionRiskFromActionPrompt(actionPrompt), [actionPrompt]);

  useEffect(() => {
    if (videoBackends.length && !videoBackends.some((backend) => backend.id === selectedBackendId)) {
      setSelectedBackendId(videoBackends.find((backend) => backend.id === "veo-3.1")?.id ?? videoBackends[0].id);
    }
  }, [videoBackends, selectedBackendId]);

  const loadGalleryImages = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("generations")
      .select("id,prompt,asset_url,url")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(30);
    setGalleryImages((data ?? []) as GalleryImageItem[]);
  }, [supabase]);

  useEffect(() => {
    void loadGalleryImages();
    async function loadBackends() {
      const response = await fetch("/api/ai/backends");
      const payload = (await response.json()) as { data?: AIBackend[] };
      setBackends(payload.data ?? []);
    }
    void loadBackends();
  }, [loadGalleryImages]);

  useEffect(() => {
    const allowed = getPresetOptions(fidelityPriority);
    if (!allowed.includes(motionPreset)) setMotionPreset(allowed[0]);
  }, [fidelityPriority, motionPreset]);

  function applyFrameSelection(slot: AnchorSlot, frame: FrameSelection) {
    if (slot === "identity") setIdentityAnchor(frame);
    if (slot === "garment") setGarmentAnchor(frame);
    if (slot === "fit") setFitAnchor(frame);
    if (slot === "first") setFirstFrame(frame);
    if (slot === "last") setLastFrame(frame);
  }

  function addReferenceImage(frame: FrameSelection) {
    setReferenceImages((current) => {
      if (current.some((item) => item.imageUrl === frame.imageUrl)) return current;
      if (current.length >= 6) return current;
      return [...current, frame];
    });
  }

  async function handleUploadFrame(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const payload = (await response.json()) as { success?: boolean; public_url?: string; error?: string };
    if (!response.ok || !payload.success || !payload.public_url) {
      setError(payload.error ?? "Upload failed.");
      return;
    }

    const frame = { sourceGenerationId: null, imageUrl: payload.public_url, label: file.name };
    if (inputMode === "multi-reference") addReferenceImage(frame);
    else applyFrameSelection(uploadSlot, frame);
    setError(null);
  }

  async function handleGenerate() {
    if (!canGenerate || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const videoMode = videoGoal === "subtle-motion" ? "animated-still-strict" : videoGoal === "experimental-cinematic" ? "creative-reinterpretation" : "anchored-short-shot";
      const response = await fetch("/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_backend_id: selectedBackendId || null,
          input_mode: inputMode,
          video_goal: videoGoal,
          fidelity_priority: fidelityPriority,
          action_prompt: actionPrompt,
          style_hint: styleHint || null,
          video_mode: videoMode,
          identity_anchor: identityAnchor ? { url: identityAnchor.imageUrl, generation_id: identityAnchor.sourceGenerationId } : undefined,
          garment_anchor: garmentAnchor ? { url: garmentAnchor.imageUrl, generation_id: garmentAnchor.sourceGenerationId } : undefined,
          fit_anchor: fitAnchor ? { url: fitAnchor.imageUrl, generation_id: fitAnchor.sourceGenerationId } : undefined,
          first_frame: firstFrame ? { url: firstFrame.imageUrl, generation_id: firstFrame.sourceGenerationId } : undefined,
          last_frame: lastFrame ? { url: lastFrame.imageUrl, generation_id: lastFrame.sourceGenerationId } : undefined,
          reference_images: referenceImages.map((item) => ({ url: item.imageUrl, generation_id: item.sourceGenerationId, tag: item.tag ?? null })),
          master_image_url: fitAnchor?.imageUrl,
          source_generation_id: fitAnchor?.sourceGenerationId,
          start_frame_url: firstFrame?.imageUrl,
          end_frame_url: lastFrame?.imageUrl,
          motion_preset: motionPreset,
          duration_seconds: duration,
          style: VIDEO_STYLES[0],
          motion_strength: motionStrength,
          camera_motion: "push",
          subject_motion: motionStrength === "subtle" ? "subtle" : "moderate",
          strict_garment_lock: true,
          strict_anchor: true,
          aspect_ratio: aspectRatio,
          creative_notes: actionPrompt,
          requested_thumbnail_url: firstFrame?.imageUrl || fitAnchor?.imageUrl || referenceImages[0]?.imageUrl,
        }),
      });

      const payload = (await response.json()) as { success?: boolean; generationId?: string; outputUrl?: string; downloadUrl?: string; thumbnailUrl?: string; error?: string; videoMeta?: { motionPreset: VideoMotionPreset; durationSeconds: VideoDurationSeconds; motionStrength: VideoMotionStrength; motionRiskLevel?: MotionRiskLevel; compatibilityWarnings?: string[] } };
      if (!response.ok || !payload.success || !payload.outputUrl || !payload.generationId || !payload.videoMeta) {
        throw new Error(payload.error ?? "Video generation failed.");
      }

      const result: VideoResult = {
        generationId: payload.generationId,
        outputUrl: payload.outputUrl,
        downloadUrl: payload.downloadUrl || `/api/studio/video/${payload.generationId}/download`,
        thumbnailUrl: payload.thumbnailUrl,
        motionPreset: payload.videoMeta.motionPreset,
        durationSeconds: payload.videoMeta.durationSeconds,
        motionStrength: payload.videoMeta.motionStrength,
        motionRiskLevel: payload.videoMeta.motionRiskLevel,
        compatibilityWarnings: payload.videoMeta.compatibilityWarnings,
        createdAt: new Date().toISOString(),
      };

      setLatestResult(result);
      setHistory((current) => [result, ...current]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Video generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  const canGenerate = Boolean(
    selectedBackendId &&
      actionPrompt.trim() &&
      (inputMode === "multi-reference"
        ? referenceImages.length >= 4
        : fitAnchor?.imageUrl || (firstFrame?.imageUrl && lastFrame?.imageUrl)),
  );

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/60 to-zinc-950 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Megaska Reference-Conditioned Video Engine</p>
              <h1 className="text-3xl font-semibold text-white">Video Project V2</h1>
              <p className="text-sm text-zinc-300">Multi-reference + anchor routing with invariants, action prompt, fidelity control, and motion-risk awareness.</p>
            </div>
            <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950/70 p-1">
              <Link href="/" className="rounded-md px-4 py-2 text-sm text-zinc-300 hover:text-white">Image Project</Link>
              <Link href="/studio/video" className="rounded-md bg-cyan-500 px-4 py-2 text-sm text-slate-950">Video Project</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6 rounded-xl border border-white/10 bg-zinc-900/50 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-zinc-300">Video Goal</span>
                <select value={videoGoal} onChange={(e) => setVideoGoal(e.target.value as VideoGoal)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2">
                  {VIDEO_GOALS.map((goal) => <option key={goal} value={goal}>{getVideoGoalLabel(goal)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-zinc-300">Input Mode</span>
                <select value={inputMode} onChange={(e) => setInputMode(e.target.value as VideoInputMode)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2">
                  {VIDEO_INPUT_MODES.map((mode) => <option key={mode} value={mode}>{getVideoInputModeLabel(mode)}</option>)}
                </select>
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-white/10 p-3">
              <h2 className="text-base font-semibold">References</h2>
              {inputMode === "multi-reference" ? (
                <>
                  <p className="text-xs text-zinc-400">Add 4-6 references, reorder them, and optionally tag each image.</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {referenceImages.map((item, index) => (
                      <div key={`${item.imageUrl}-${index}`} className="rounded-md border border-cyan-400/20 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt={item.label} className="h-24 w-full rounded object-cover" />
                        <div className="mt-2 flex gap-1">
                          <button type="button" onClick={() => setReferenceImages((curr) => curr.filter((_, idx) => idx !== index))} className="rounded border border-rose-400/40 px-2 text-xs">Remove</button>
                          <button type="button" disabled={index === 0} onClick={() => setReferenceImages((curr) => curr.map((ref, idx) => idx === index - 1 ? curr[index] : idx === index ? curr[index - 1] : ref))} className="rounded border border-white/20 px-2 text-xs">↑</button>
                          <button type="button" disabled={index === referenceImages.length - 1} onClick={() => setReferenceImages((curr) => curr.map((ref, idx) => idx === index + 1 ? curr[index] : idx === index ? curr[index + 1] : ref))} className="rounded border border-white/20 px-2 text-xs">↓</button>
                        </div>
                        <select
                          value={item.tag ?? ""}
                          onChange={(e) => setReferenceImages((curr) => curr.map((ref, idx) => idx === index ? { ...ref, tag: (e.target.value || null) as ReferenceSelection["tag"] } : ref))}
                          className="mt-2 w-full rounded border border-white/15 bg-zinc-950 px-2 py-1 text-xs"
                        >
                          <option value="">No tag</option>
                          {VIDEO_REFERENCE_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500">{referenceImages.length}/6 selected.</p>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { key: "identity", label: "Identity Anchor", value: identityAnchor },
                    { key: "garment", label: "Garment Anchor", value: garmentAnchor },
                    { key: "fit", label: "Fit Anchor" , value: fitAnchor },
                    { key: "first", label: "First Frame", value: firstFrame },
                    { key: "last", label: "Last Frame", value: lastFrame },
                  ].map((slot) => (
                    <div key={slot.key} className="rounded-md border border-cyan-400/20 p-2 text-xs">
                      <p>{slot.label}</p>
                      {slot.value ? <img src={slot.value.imageUrl} alt={slot.label} className="mt-1 h-24 w-full rounded object-cover" /> : <div className="mt-1 h-24 rounded border border-dashed border-white/20" />}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {inputMode === "anchor-based" ? (
                  (["identity", "garment", "fit", "first", "last"] as AnchorSlot[]).map((slot) => (
                    <button key={slot} type="button" onClick={() => { setUploadSlot(slot); fileInputRef.current?.click(); }} className="rounded border border-cyan-400/40 px-3 py-1 text-xs">Upload {slot}</button>
                  ))
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded border border-cyan-400/40 px-3 py-1 text-xs">Upload reference</button>
                )}
                <button type="button" onClick={() => void loadGalleryImages()} className="rounded border border-white/20 px-3 py-1 text-xs">Refresh history</button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleUploadFrame(e.target.files?.[0] ?? null)} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {galleryImages.map((item) => {
                  const imageUrl = item.asset_url || item.url;
                  if (!imageUrl) return null;
                  return (
                    <div key={item.id} className="rounded border border-white/10 p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="Gallery" className="h-20 w-full rounded object-cover" />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {inputMode === "multi-reference" ? (
                          <button type="button" onClick={() => addReferenceImage({ sourceGenerationId: item.id, imageUrl, label: item.prompt || "Gallery image" })} className="rounded border border-cyan-400/40 px-2 text-[10px]">Add</button>
                        ) : (
                          (["identity", "garment", "fit", "first", "last"] as AnchorSlot[]).map((slot) => (
                            <button key={slot} type="button" onClick={() => applyFrameSelection(slot, { sourceGenerationId: item.id, imageUrl, label: item.prompt || "Gallery image" })} className="rounded border border-cyan-400/40 px-2 text-[10px]">{slot}</button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block space-y-2 text-sm">
                <span>Action Prompt</span>
                <textarea rows={3} value={actionPrompt} onChange={(e) => setActionPrompt(e.target.value)} placeholder="running on the beach at sunset" className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2" />
              </label>
              <label className="block space-y-2 text-sm">
                <span>Style Hint (optional)</span>
                <input value={styleHint} onChange={(e) => setStyleHint(e.target.value)} placeholder="cinematic / editorial / luxury brand ad" className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2" />
              </label>
              <p className="text-xs text-zinc-400">Invariants are auto-generated and locked: identity, garment identity, silhouette, neckline, trim, pattern, colorway, structure, and proportions.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>Fidelity Priority</span>
                <select value={fidelityPriority} onChange={(e) => setFidelityPriority(e.target.value as VideoFidelityPriority)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2">
                  {VIDEO_FIDELITY_PRIORITIES.map((priority) => <option key={priority} value={priority}>{getFidelityPriorityLabel(priority)}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span>Motion Preset</span>
                <select value={motionPreset} onChange={(e) => setMotionPreset(e.target.value as VideoMotionPreset)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2">
                  {getPresetOptions(fidelityPriority).map((preset) => <option key={preset} value={preset}>{getMotionPresetLabel(preset)}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value) as VideoDurationSeconds)} className="rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                {VIDEO_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}
              </select>
              <select value={motionStrength} onChange={(e) => setMotionStrength(e.target.value as VideoMotionStrength)} className="rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                {VIDEO_MOTION_STRENGTHS.map((strength) => <option key={strength} value={strength}>{strength}</option>)}
              </select>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as VideoAspectRatio)} className="rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                {VIDEO_ASPECT_RATIO_OPTIONS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </div>

            <label className="space-y-2 text-sm block">
              <span>Video backend</span>
              <select value={selectedBackendId} onChange={(e) => setSelectedBackendId(e.target.value)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2">
                {videoBackends.map((backend) => <option key={backend.id} value={backend.id}>{backend.name}</option>)}
              </select>
            </label>

            {motionRiskLevel === "high" ? <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">High motion increases garment and identity drift risk.</p> : null}

            <button type="button" disabled={!canGenerate || isGenerating} onClick={() => void handleGenerate()} className="w-full rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-zinc-700">
              {isGenerating ? "Generating video..." : "Generate Video"}
            </button>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-900/50 p-5">
            <h2 className="text-lg font-semibold text-white">Preview output</h2>
            {latestResult ? (
              <div className="space-y-3 rounded-lg border border-cyan-400/30 bg-zinc-950/70 p-3">
                <video key={latestResult.outputUrl} src={latestResult.outputUrl} poster={latestResult.thumbnailUrl} controls className="h-auto w-full rounded-md" />
                <p className="text-xs">Risk: {latestResult.motionRiskLevel ?? "n/a"}</p>
                {latestResult.compatibilityWarnings?.map((warning) => <p key={warning} className="text-xs text-amber-200">• {warning}</p>)}
                <div className="flex gap-2">
                  <a href={latestResult.downloadUrl} download className="rounded-md border border-white/20 px-3 py-2 text-sm">Download</a>
                  <button type="button" onClick={() => router.push(`/?masterUrl=${encodeURIComponent(latestResult.thumbnailUrl ?? latestResult.outputUrl)}`)} className="rounded-md border border-cyan-400/50 px-3 py-2 text-sm text-cyan-200">Use Frame in Image Project</button>
                </div>
              </div>
            ) : <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-zinc-400">Your generated video will appear here.</div>}

            {history.length > 0 ? <div className="space-y-2">{history.slice(0, 4).map((item) => <button key={item.generationId} onClick={() => setLatestResult(item)} className="w-full rounded-md border border-white/10 px-3 py-2 text-left text-xs">{item.durationSeconds}s · {item.motionPreset}</button>)}</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
