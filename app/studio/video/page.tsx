"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  getMotionPresetLabel,
  getMotionStrengthLabel,
  getStyleLabel,
  getVideoModeDescription,
  getVideoModeLabel,
  VIDEO_ANCHORED_SAFE_MOTION_PRESETS,
  VIDEO_DURATIONS,
  VIDEO_EXPERIMENTAL_MOTION_PRESETS,
  VIDEO_MODES,
  VIDEO_MOTION_STRENGTHS,
  VIDEO_STYLES,
  VIDEO_STRICT_SAFE_MOTION_PRESETS,
  type VideoDurationSeconds,
  type VideoMode,
  type VideoMotionPreset,
  type VideoMotionStrength,
  type VideoStyle,
} from "@/lib/video/promptBuilder";

const VIDEO_ASPECT_RATIO_OPTIONS = ["16:9", "9:16"] as const;
type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIO_OPTIONS)[number];
type AnchorSlot = "identity" | "garment" | "fit" | "first" | "last";

type AIBackend = { id: string; name: string; type: "image" | "video"; model: string };

type GalleryImageItem = {
  id: string;
  prompt: string;
  created_at?: string;
  asset_url?: string | null;
  url?: string | null;
  generation_kind?: "image" | "video";
};

type FrameSelection = {
  sourceGenerationId: string | null;
  imageUrl: string;
  label: string;
};

type VideoResult = {
  generationId: string;
  outputUrl: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  videoMode: VideoMode;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  style: VideoStyle;
  motionStrength: VideoMotionStrength;
  motionRiskLevel?: "low" | "medium" | "high";
  compatibilityWarnings?: string[];
  createdAt: string;
};

function getPresetOptions(mode: VideoMode) {
  if (mode === "animated-still-strict") return VIDEO_STRICT_SAFE_MOTION_PRESETS;
  if (mode === "anchored-short-shot") return VIDEO_ANCHORED_SAFE_MOTION_PRESETS;
  return [...VIDEO_ANCHORED_SAFE_MOTION_PRESETS, ...VIDEO_EXPERIMENTAL_MOTION_PRESETS];
}

function getModeBadge(mode: VideoMode) {
  if (mode === "animated-still-strict") {
    return <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">Recommended</span>;
  }
  if (mode === "anchored-short-shot") {
    return <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">More motion, higher drift risk</span>;
  }
  return <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">Experimental, not fidelity-safe</span>;
}

export default function VideoProjectPage() {
  const [backends, setBackends] = useState<AIBackend[]>([]);
  const [selectedBackendId, setSelectedBackendId] = useState("");
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [identityAnchor, setIdentityAnchor] = useState<FrameSelection | null>(null);
  const [garmentAnchor, setGarmentAnchor] = useState<FrameSelection | null>(null);
  const [fitAnchor, setFitAnchor] = useState<FrameSelection | null>(null);
  const [firstFrame, setFirstFrame] = useState<FrameSelection | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameSelection | null>(null);
  const [uploadSlot, setUploadSlot] = useState<AnchorSlot>("fit");
  const [videoMode, setVideoMode] = useState<VideoMode>("animated-still-strict");
  const [motionPreset, setMotionPreset] = useState<VideoMotionPreset>("subtle-breathing");
  const [duration, setDuration] = useState<VideoDurationSeconds>(8);
  const [style, setStyle] = useState<VideoStyle>("realistic");
  const [motionStrength, setMotionStrength] = useState<VideoMotionStrength>("subtle");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [creativeNotes, setCreativeNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<VideoResult | null>(null);
  const [history, setHistory] = useState<VideoResult[]>([]);
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);
  const [extractedFrame, setExtractedFrame] = useState<{
    generationId: string;
    frameUrl: string;
    sourceVideoGenerationId: string;
    extractedAt: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestVideoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const videoBackends = useMemo(() => backends.filter((backend) => backend.type === "video"), [backends]);

  useEffect(() => {
    if (videoBackends.length && !videoBackends.some((backend) => backend.id === selectedBackendId)) {
      const preferred = videoBackends.find((backend) => backend.id === "veo-3.1") ?? videoBackends[0];
      setSelectedBackendId(preferred.id);
    }
  }, [videoBackends, selectedBackendId]);

  const loadGalleryImages = useCallback(async () => {
    if (!supabase) return;

    const { data } = await supabase
      .from("generations")
      .select("id,prompt,created_at,asset_url,url,generation_kind")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(30);

    setGalleryImages((data ?? []) as GalleryImageItem[]);
  }, [supabase]);

  useEffect(() => {
    loadGalleryImages();
  }, [loadGalleryImages]);

  useEffect(() => {
    async function loadBackends() {
      const response = await fetch("/api/ai/backends");
      const payload = (await response.json()) as { data?: AIBackend[] };
      setBackends(payload.data ?? []);
    }

    loadBackends();
  }, []);

  useEffect(() => {
    const allowed = getPresetOptions(videoMode);
    if (!allowed.some((preset) => preset === motionPreset)) {
      setMotionPreset(allowed[0]);
    }

    if (videoMode === "animated-still-strict") {
      setMotionStrength("subtle");
    }
  }, [videoMode, motionPreset]);

  function formatGeneratedAt(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Just now";
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }

  function applyFrameSelection(slot: AnchorSlot, frame: FrameSelection) {
    if (slot === "identity") setIdentityAnchor(frame);
    if (slot === "garment") setGarmentAnchor(frame);
    if (slot === "fit") setFitAnchor(frame);
    if (slot === "first") setFirstFrame(frame);
    if (slot === "last") setLastFrame(frame);
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

    applyFrameSelection(uploadSlot, {
      sourceGenerationId: null,
      imageUrl: payload.public_url,
      label: file.name,
    });
    setError(null);
  }

  async function handleGenerate() {
    if (!canGenerate || isGenerating) return;

    try {
      setIsGenerating(true);
      setError(null);

      const response = await fetch("/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_backend_id: selectedBackendId || null,
          video_mode: videoMode,
          identity_anchor: identityAnchor
            ? { url: identityAnchor.imageUrl, generation_id: identityAnchor.sourceGenerationId }
            : undefined,
          garment_anchor: garmentAnchor
            ? { url: garmentAnchor.imageUrl, generation_id: garmentAnchor.sourceGenerationId }
            : undefined,
          fit_anchor: fitAnchor ? { url: fitAnchor.imageUrl, generation_id: fitAnchor.sourceGenerationId } : undefined,
          first_frame: firstFrame ? { url: firstFrame.imageUrl, generation_id: firstFrame.sourceGenerationId } : undefined,
          last_frame: lastFrame ? { url: lastFrame.imageUrl, generation_id: lastFrame.sourceGenerationId } : undefined,
          master_image_url: fitAnchor?.imageUrl,
          source_generation_id: fitAnchor?.sourceGenerationId,
          start_frame_url: firstFrame?.imageUrl,
          start_frame_generation_id: firstFrame?.sourceGenerationId,
          end_frame_url: lastFrame?.imageUrl,
          end_frame_generation_id: lastFrame?.sourceGenerationId,
          motion_preset: motionPreset,
          duration_seconds: duration,
          style,
          motion_strength: motionStrength,
          camera_motion: "push",
          subject_motion: motionStrength === "subtle" ? "subtle" : "moderate",
          strict_garment_lock: true,
          strict_anchor: true,
          aspect_ratio: aspectRatio,
          creative_notes: creativeNotes,
          requested_thumbnail_url: firstFrame?.imageUrl || fitAnchor?.imageUrl,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        generationId?: string;
        outputUrl?: string;
        downloadUrl?: string;
        thumbnailUrl?: string;
        videoMeta?: {
          videoMode: VideoMode;
          motionPreset: VideoMotionPreset;
          durationSeconds: VideoDurationSeconds;
          style: VideoStyle;
          motionStrength: VideoMotionStrength;
          motionRiskLevel?: "low" | "medium" | "high";
          compatibilityWarnings?: string[];
        };
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.outputUrl || !payload.generationId || !payload.videoMeta) {
        throw new Error(payload.error ?? "Video generation failed.");
      }

      const result: VideoResult = {
        generationId: payload.generationId,
        outputUrl: payload.outputUrl,
        downloadUrl: payload.downloadUrl || `/api/studio/video/${payload.generationId}/download`,
        thumbnailUrl: payload.thumbnailUrl,
        videoMode: payload.videoMeta.videoMode,
        motionPreset: payload.videoMeta.motionPreset,
        durationSeconds: payload.videoMeta.durationSeconds,
        style: payload.videoMeta.style,
        motionStrength: payload.videoMeta.motionStrength,
        motionRiskLevel: payload.videoMeta.motionRiskLevel,
        compatibilityWarnings: payload.videoMeta.compatibilityWarnings,
        createdAt: new Date().toISOString(),
      };

      setLatestResult(result);
      setHistory((current) => [result, ...current]);
      setExtractedFrame(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Video generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleExtractFrame() {
    if (!latestResult || isExtractingFrame) return null;

    try {
      setIsExtractingFrame(true);
      setError(null);

      const frameUrl = latestResult.thumbnailUrl || fitAnchor?.imageUrl || latestResult.outputUrl;

      const response = await fetch("/api/studio/video/extract-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_video_generation_id: latestResult.generationId,
          frame_url: frameUrl,
          backend_model: videoBackends.find((backend) => backend.id === selectedBackendId)?.model ?? null,
          extraction_method: latestResult.thumbnailUrl ? "thumbnail" : "fallback",
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        generationId?: string;
        frameUrl?: string;
        sourceVideoGenerationId?: string;
        extractedAt?: string;
        error?: string;
      };

      if (
        !response.ok ||
        !payload.success ||
        !payload.generationId ||
        !payload.frameUrl ||
        !payload.sourceVideoGenerationId ||
        !payload.extractedAt
      ) {
        throw new Error(payload.error ?? "Frame extraction failed.");
      }

      const frame = {
        generationId: payload.generationId,
        frameUrl: payload.frameUrl,
        sourceVideoGenerationId: payload.sourceVideoGenerationId,
        extractedAt: payload.extractedAt,
      };

      setExtractedFrame(frame);
      await loadGalleryImages();
      return frame;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Frame extraction failed.");
      return null;
    } finally {
      setIsExtractingFrame(false);
    }
  }

  async function handleUseFrameAsMaster() {
    const frame = extractedFrame ?? (await handleExtractFrame());
    if (!frame) return;

    const query = new URLSearchParams({
      masterGenerationId: frame.generationId,
      masterUrl: frame.frameUrl,
      sourceVideoGenerationId: frame.sourceVideoGenerationId,
      extractedAt: frame.extractedAt,
    });

    router.push(`/?${query.toString()}`);
  }

  const canGenerate = Boolean(
    selectedBackendId &&
      ((videoMode === "animated-still-strict" && fitAnchor?.imageUrl) ||
        (videoMode === "anchored-short-shot" && firstFrame?.imageUrl && lastFrame?.imageUrl) ||
        (videoMode === "creative-reinterpretation" && (fitAnchor?.imageUrl || firstFrame?.imageUrl || identityAnchor?.imageUrl))),
  );

  const modePresets = getPresetOptions(videoMode);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/60 to-zinc-950 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Studio Project</p>
              <h1 className="text-3xl font-semibold text-white">Video Project</h1>
              <p className="text-sm text-zinc-300">
                Fidelity-first motion generation for Megaska subject packages. Use strict mode for highest consistency.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950/70 p-1">
              <Link href="/" className="rounded-md px-4 py-2 text-sm text-zinc-300 hover:text-white">
                Image Project
              </Link>
              <Link href="/studio/video" className="rounded-md bg-cyan-500 px-4 py-2 text-sm text-slate-950">
                Video Project
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6 rounded-xl border border-white/10 bg-zinc-900/50 p-5">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white">1) Subject package anchors</h2>
              <p className="text-sm text-zinc-400">Best results come from anchors with same model, garment, and scene. Large pose changes increase drift risk.</p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { key: "identity", label: "Identity Anchor (optional)", value: identityAnchor },
                  { key: "garment", label: "Garment Anchor (optional)", value: garmentAnchor },
                  { key: "fit", label: "Fit Anchor (required for strict mode)", value: fitAnchor },
                  { key: "first", label: "First Frame (required for anchored-short-shot)", value: firstFrame },
                  { key: "last", label: "Last Frame (required for anchored-short-shot)", value: lastFrame },
                ].map((slot) => (
                  <div key={slot.key} className="rounded-lg border border-cyan-400/30 bg-zinc-950/50 p-3">
                    <p className="text-xs uppercase text-cyan-300">{slot.label}</p>
                    {slot.value ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slot.value.imageUrl} alt={slot.label} className="mt-2 h-32 w-full rounded-md object-cover" />
                    ) : (
                      <div className="mt-2 h-32 rounded-md border border-dashed border-white/20" />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {([
                  ["identity", "Upload Identity Anchor"],
                  ["garment", "Upload Garment Anchor"],
                  ["fit", "Upload Fit Anchor"],
                  ["first", "Upload First Frame"],
                  ["last", "Upload Last Frame"],
                ] as Array<[AnchorSlot, string]>).map(([slot, label]) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setUploadSlot(slot);
                      fileInputRef.current?.click();
                    }}
                    className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200"
                  >
                    {label}
                  </button>
                ))}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleUploadFrame(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => void loadGalleryImages()}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-300"
                >
                  Refresh history
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {galleryImages.map((item) => {
                  const imageUrl = item.asset_url || item.url;
                  if (!imageUrl) return null;

                  return (
                    <div key={item.id} className="overflow-hidden rounded-lg border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="Anchor candidate" className="h-28 w-full object-cover" />
                      <div className="space-y-1 p-2 text-xs">
                        <p className="line-clamp-2 text-zinc-200">{item.prompt || "Untitled"}</p>
                        <div className="grid grid-cols-5 gap-1 pt-1">
                          {([
                            ["identity", "ID"],
                            ["garment", "GAR"],
                            ["fit", "FIT"],
                            ["first", "FIRST"],
                            ["last", "LAST"],
                          ] as Array<[AnchorSlot, string]>).map(([slot, label]) => (
                            <button
                              key={`${item.id}-${slot}`}
                              type="button"
                              onClick={() =>
                                applyFrameSelection(slot, {
                                  sourceGenerationId: item.id,
                                  imageUrl,
                                  label: item.prompt || "Gallery image",
                                })
                              }
                              className="rounded border border-cyan-400/40 px-1 py-1 text-[10px] text-cyan-200"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-5">
              <h2 className="text-lg font-semibold text-white">2) Mode and motion</h2>
              <p className="text-xs text-cyan-200">
                Strict mode is best for subtle motion from one approved image. Anchored short shot is for short transitions between very similar approved frames. Creative mode may redesign details.
              </p>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Video backend</span>
                <select
                  value={selectedBackendId}
                  onChange={(event) => setSelectedBackendId(event.target.value)}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                >
                  {videoBackends.map((backend) => (
                    <option key={backend.id} value={backend.id}>
                      {backend.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Video mode</span>
                <select
                  value={videoMode}
                  onChange={(event) => setVideoMode(event.target.value as VideoMode)}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                >
                  {VIDEO_MODES.map((modeOption) => (
                    <option key={modeOption} value={modeOption}>
                      {getVideoModeLabel(modeOption)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-2">
                {getModeBadge(videoMode)}
                <p className="text-xs text-zinc-400">{getVideoModeDescription(videoMode)}</p>
              </div>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Motion preset</span>
                <select
                  value={motionPreset}
                  onChange={(event) => setMotionPreset(event.target.value as VideoMotionPreset)}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                >
                  {modePresets.map((preset) => (
                    <option key={preset} value={preset}>
                      {getMotionPresetLabel(preset)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Duration</span>
                  <select value={duration} onChange={(event) => setDuration(Number(event.target.value) as VideoDurationSeconds)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                    {VIDEO_DURATIONS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds}s
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Style</span>
                  <select value={style} onChange={(event) => setStyle(event.target.value as VideoStyle)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                    {VIDEO_STYLES.map((styleOption) => (
                      <option key={styleOption} value={styleOption}>
                        {getStyleLabel(styleOption)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Motion strength</span>
                <select value={motionStrength} onChange={(event) => setMotionStrength(event.target.value as VideoMotionStrength)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                  {VIDEO_MOTION_STRENGTHS.map((strength) => (
                    <option key={strength} value={strength} disabled={videoMode === "animated-still-strict" && strength !== "subtle"}>
                      {getMotionStrengthLabel(strength)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Aspect ratio</span>
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as VideoAspectRatio)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                  {VIDEO_ASPECT_RATIO_OPTIONS.map((ratioOption) => (
                    <option key={ratioOption} value={ratioOption}>
                      {ratioOption}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Creative notes (optional)</span>
                <textarea
                  rows={2}
                  value={creativeNotes}
                  onChange={(event) => setCreativeNotes(event.target.value)}
                  placeholder="Ignored in strict mode; used for anchored and creative modes"
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <button type="button" disabled={!canGenerate || isGenerating} onClick={() => void handleGenerate()} className="w-full rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-zinc-700">
                {isGenerating ? "Generating video..." : "Generate Video"}
              </button>
              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-900/50 p-5">
            <h2 className="text-lg font-semibold text-white">3) Preview output</h2>
            {fitAnchor ? (
              <div className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Primary anchor preview</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fitAnchor.imageUrl} alt="Selected fit anchor" className="mt-2 h-44 w-full rounded-md object-cover" />
                <p className="mt-2 line-clamp-2 text-xs text-zinc-300">{fitAnchor.label}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-zinc-400">Select anchors to begin.</div>
            )}

            {latestResult ? (
              <div className="space-y-3 rounded-lg border border-cyan-400/30 bg-zinc-950/70 p-3">
                <video ref={latestVideoRef} key={latestResult.outputUrl} src={latestResult.outputUrl} poster={latestResult.thumbnailUrl} controls className="h-auto w-full rounded-md" />
                <div className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
                  <p>Mode: {getVideoModeLabel(latestResult.videoMode)}</p>
                  <p>Preset: {getMotionPresetLabel(latestResult.motionPreset)}</p>
                  <p>Duration: {latestResult.durationSeconds}s</p>
                  <p>Style: {getStyleLabel(latestResult.style)}</p>
                  <p>Strength: {getMotionStrengthLabel(latestResult.motionStrength)}</p>
                  <p>Risk level: {latestResult.motionRiskLevel ?? "n/a"}</p>
                  <p>Generated: {formatGeneratedAt(latestResult.createdAt)}</p>
                </div>
                {latestResult.compatibilityWarnings?.length ? (
                  <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                    {latestResult.compatibilityWarnings.map((warning) => (
                      <p key={warning}>• {warning}</p>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <a href={latestResult.downloadUrl} download className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-100">Download</a>
                  <button type="button" onClick={() => void handleExtractFrame()} disabled={isExtractingFrame} className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50">
                    {isExtractingFrame ? "Extracting..." : "Extract Frame"}
                  </button>
                  <button type="button" onClick={() => void handleUseFrameAsMaster()} disabled={isExtractingFrame} className="rounded-md border border-cyan-400/50 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50">
                    Use Frame in Image Project
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-zinc-400">Your generated video will appear here.</div>
            )}

            {history.length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Session history</p>
                <div className="space-y-2">
                  {history.slice(0, 4).map((item) => (
                    <button type="button" key={item.generationId} onClick={() => setLatestResult(item)} className="w-full rounded-md border border-white/10 px-3 py-2 text-left text-xs hover:border-white/30">
                      <p className="text-zinc-200">{getMotionPresetLabel(item.motionPreset)} · {item.durationSeconds}s · {getStyleLabel(item.style)}</p>
                      <p className="text-zinc-400">{formatGeneratedAt(item.createdAt)}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
