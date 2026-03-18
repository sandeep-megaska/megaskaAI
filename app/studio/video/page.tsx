"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  getMotionPresetLabel,
  getMotionStrengthLabel,
  getStyleLabel,
  VIDEO_DURATIONS,
  VIDEO_MOTION_PRESETS,
  VIDEO_MOTION_STRENGTHS,
  VIDEO_STYLES,
  type VideoDurationSeconds,
  type VideoMotionPreset,
  type VideoMotionStrength,
  type VideoStyle,
} from "@/lib/video/promptBuilder";
import { STUDIO_ASPECT_RATIO_OPTIONS, type StudioAspectRatio } from "@/lib/studio/aspectRatios";

type AIBackend = { id: string; name: string; type: "image" | "video"; model: string };

type GalleryImageItem = {
  id: string;
  prompt: string;
  created_at?: string;
  asset_url?: string | null;
  url?: string | null;
  generation_kind?: "image" | "video";
};

type MasterSelection = {
  sourceGenerationId: string | null;
  imageUrl: string;
  label: string;
};

type VideoResult = {
  generationId: string;
  outputUrl: string;
  thumbnailUrl?: string;
  sourceGenerationId: string | null;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  style: VideoStyle;
  motionStrength: VideoMotionStrength;
  strictGarmentLock: boolean;
  createdAt: string;
};

export default function VideoProjectPage() {
  const [backends, setBackends] = useState<AIBackend[]>([]);
  const [selectedBackendId, setSelectedBackendId] = useState("");
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [masterSelection, setMasterSelection] = useState<MasterSelection | null>(null);
  const [motionPreset, setMotionPreset] = useState<VideoMotionPreset>("subtle-motion");
  const [duration, setDuration] = useState<VideoDurationSeconds>(5);
  const [style, setStyle] = useState<VideoStyle>("realistic");
  const [motionStrength, setMotionStrength] = useState<VideoMotionStrength>("subtle");
  const [strictGarmentLock, setStrictGarmentLock] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<StudioAspectRatio>("9:16");
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
      setSelectedBackendId(videoBackends[0].id);
    }
  }, [videoBackends, selectedBackendId]);

  const loadGalleryImages = useCallback(async () => {
    if (!supabase) return;

    const { data } = await supabase
      .from("generations")
      .select("id,prompt,created_at,asset_url,url,generation_kind")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(18);

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

  async function handleUploadMasterImage(file: File | null) {
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    const response = await fetch("/api/upload", { method: "POST", body: form });
    const payload = (await response.json()) as { success?: boolean; public_url?: string; error?: string };

    if (!response.ok || !payload.success || !payload.public_url) {
      setError(payload.error ?? "Upload failed.");
      return;
    }

    setMasterSelection({
      sourceGenerationId: null,
      imageUrl: payload.public_url,
      label: file.name,
    });
    setError(null);
  }

  async function handleGenerate() {
    if (!masterSelection?.imageUrl || isGenerating) return;

    try {
      setIsGenerating(true);
      setError(null);

      const response = await fetch("/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_backend_id: selectedBackendId || null,
          master_image_url: masterSelection.imageUrl,
          source_generation_id: masterSelection.sourceGenerationId,
          motion_preset: motionPreset,
          duration_seconds: duration,
          style,
          motion_strength: motionStrength,
          strict_garment_lock: strictGarmentLock,
          aspect_ratio: aspectRatio,
          creative_notes: creativeNotes,
          requested_thumbnail_url: masterSelection.imageUrl,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        generationId?: string;
        outputUrl?: string;
        thumbnailUrl?: string;
        sourceGenerationId?: string | null;
        videoMeta?: {
          motionPreset: VideoMotionPreset;
          durationSeconds: VideoDurationSeconds;
          style: VideoStyle;
          motionStrength: VideoMotionStrength;
          strictGarmentLock: boolean;
        };
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.outputUrl || !payload.generationId || !payload.videoMeta) {
        throw new Error(payload.error ?? "Video generation failed.");
      }

      const result: VideoResult = {
        generationId: payload.generationId,
        outputUrl: payload.outputUrl,
        thumbnailUrl: payload.thumbnailUrl,
        sourceGenerationId: payload.sourceGenerationId ?? null,
        motionPreset: payload.videoMeta.motionPreset,
        durationSeconds: payload.videoMeta.durationSeconds,
        style: payload.videoMeta.style,
        motionStrength: payload.videoMeta.motionStrength,
        strictGarmentLock: payload.videoMeta.strictGarmentLock,
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

      const frameUrl = latestResult.thumbnailUrl || masterSelection?.imageUrl || latestResult.outputUrl;

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

      if (!response.ok || !payload.success || !payload.generationId || !payload.frameUrl || !payload.sourceVideoGenerationId || !payload.extractedAt) {
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

  const canGenerate = Boolean(masterSelection?.imageUrl && selectedBackendId);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/60 to-zinc-950 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Studio Project</p>
              <h1 className="text-3xl font-semibold text-white">Video Project</h1>
              <p className="text-sm text-zinc-300">
                Structured image-to-video workflow for premium apparel motion generation. Start from a master image, lock garment
                fidelity, and produce polished clips.
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
              <h2 className="text-lg font-semibold text-white">1) Master image</h2>
              <p className="text-sm text-zinc-400">Select from image history or upload a new master image.</p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
                >
                  Upload master image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleUploadMasterImage(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => void loadGalleryImages()}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-300 hover:text-white"
                >
                  Refresh history
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {galleryImages.map((item) => {
                  const imageUrl = item.asset_url || item.url;
                  if (!imageUrl) return null;
                  const isSelected = masterSelection?.sourceGenerationId === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setMasterSelection({
                          sourceGenerationId: item.id,
                          imageUrl,
                          label: item.prompt || "Gallery image",
                        })
                      }
                      className={`overflow-hidden rounded-lg border text-left transition ${
                        isSelected ? "border-cyan-300" : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="Master candidate" className="h-36 w-full object-cover" />
                      <div className="space-y-1 p-2 text-xs">
                        <p className="line-clamp-2 text-zinc-200">{item.prompt || "Untitled"}</p>
                        {item.created_at ? <p className="text-zinc-400">{formatGeneratedAt(item.created_at)}</p> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-5">
              <h2 className="text-lg font-semibold text-white">2-5) Video controls</h2>

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
                <span className="text-zinc-300">Motion preset</span>
                <select
                  value={motionPreset}
                  onChange={(event) => setMotionPreset(event.target.value as VideoMotionPreset)}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                >
                  {VIDEO_MOTION_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {getMotionPresetLabel(preset)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Duration</span>
                  <select
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value) as VideoDurationSeconds)}
                    className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    {VIDEO_DURATIONS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds}s
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Style</span>
                  <select
                    value={style}
                    onChange={(event) => setStyle(event.target.value as VideoStyle)}
                    className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    {VIDEO_STYLES.map((styleOption) => (
                      <option key={styleOption} value={styleOption}>
                        {getStyleLabel(styleOption)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Motion strength</span>
                  <select
                    value={motionStrength}
                    onChange={(event) => setMotionStrength(event.target.value as VideoMotionStrength)}
                    className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    {VIDEO_MOTION_STRENGTHS.map((strength) => (
                      <option key={strength} value={strength}>
                        {getMotionStrengthLabel(strength)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Aspect ratio</span>
                  <select
                    value={aspectRatio}
                    onChange={(event) => setAspectRatio(event.target.value as StudioAspectRatio)}
                    className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    {STUDIO_ASPECT_RATIO_OPTIONS.map((ratioOption) => (
                      <option key={ratioOption.id} value={ratioOption.ratio}>
                        {ratioOption.label} ({ratioOption.ratio})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-md border border-white/10 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={strictGarmentLock}
                  onChange={(event) => setStrictGarmentLock(event.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                <span className="text-zinc-200">Strict Garment Lock (preserve exact apparel identity)</span>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Creative notes (optional)</span>
                <textarea
                  rows={3}
                  value={creativeNotes}
                  onChange={(event) => setCreativeNotes(event.target.value)}
                  placeholder="Optional direction for pacing, mood, or camera emphasis..."
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                />
              </label>

              <button
                type="button"
                disabled={!canGenerate || isGenerating}
                onClick={() => void handleGenerate()}
                className="w-full rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {isGenerating ? "Generating video..." : "Generate Video"}
              </button>
              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-900/50 p-5">
            <h2 className="text-lg font-semibold text-white">6-7) Preview output</h2>
            {masterSelection ? (
              <div className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Master image</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={masterSelection.imageUrl} alt="Selected master" className="mt-2 h-44 w-full rounded-md object-cover" />
                <p className="mt-2 line-clamp-2 text-xs text-zinc-300">{masterSelection.label}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-zinc-400">
                Select or upload a master image to begin.
              </div>
            )}

            {latestResult ? (
              <div className="space-y-3 rounded-lg border border-cyan-400/30 bg-zinc-950/70 p-3">
                <video
                  ref={latestVideoRef}
                  key={latestResult.outputUrl}
                  src={latestResult.outputUrl}
                  poster={latestResult.thumbnailUrl}
                  controls
                  className="h-auto w-full rounded-md"
                />
                <div className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
                  <p>Preset: {getMotionPresetLabel(latestResult.motionPreset)}</p>
                  <p>Duration: {latestResult.durationSeconds}s</p>
                  <p>Style: {getStyleLabel(latestResult.style)}</p>
                  <p>Strength: {getMotionStrengthLabel(latestResult.motionStrength)}</p>
                  <p>Garment lock: {latestResult.strictGarmentLock ? "On" : "Off"}</p>
                  <p>Generated: {formatGeneratedAt(latestResult.createdAt)}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const video = latestVideoRef.current;
                      if (video) {
                        video.currentTime = 0;
                        void video.play();
                      }
                    }}
                    className="rounded-md border border-white/20 px-3 py-2 text-sm"
                  >
                    Replay
                  </button>
                  <a
                    href={latestResult.outputUrl}
                    download
                    className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-100"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleExtractFrame()}
                    disabled={isExtractingFrame}
                    className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
                  >
                    {isExtractingFrame ? "Extracting..." : "Extract Frame"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUseFrameAsMaster()}
                    disabled={isExtractingFrame}
                    className="rounded-md border border-cyan-400/50 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50"
                  >
                    Use Frame as Master
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={isGenerating || !canGenerate}
                    className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                </div>
                {extractedFrame && extractedFrame.sourceVideoGenerationId === latestResult.generationId ? (
                  <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3">
                    <p className="text-xs font-medium text-emerald-200">Frame extracted and saved to Image Project</p>
                    <div className="mt-2 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={extractedFrame.frameUrl} alt="Extracted frame" className="h-14 w-14 rounded-md object-cover" />
                      <p className="text-xs text-zinc-200">Use it as the next master to continue Generate More Views in Image Project.</p>
                    </div>
                  </div>
                ) : null}

              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-zinc-400">
                Your generated video will appear here.
              </div>
            )}

            {history.length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Session history</p>
                <div className="space-y-2">
                  {history.slice(0, 4).map((item) => (
                    <button
                      type="button"
                      key={item.generationId}
                      onClick={() => {
                        setLatestResult(item);
                        setExtractedFrame(null);
                      }}
                      className="w-full rounded-md border border-white/10 px-3 py-2 text-left text-xs hover:border-white/30"
                    >
                      <p className="text-zinc-200">
                        {getMotionPresetLabel(item.motionPreset)} · {item.durationSeconds}s · {getStyleLabel(item.style)}
                      </p>
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
