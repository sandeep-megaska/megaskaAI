"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  getCameraMotionLabel,
  getMotionPresetLabel,
  getMotionStrengthLabel,
  getStyleLabel,
  getSubjectMotionLabel,
  getVideoModeLabel,
  VIDEO_CAMERA_MOTIONS,
  VIDEO_DURATIONS,
  VIDEO_MODES,
  VIDEO_SAFE_MOTION_PRESETS,
  VIDEO_MOTION_STRENGTHS,
  VIDEO_STYLES,
  VIDEO_SUBJECT_MOTIONS,
  type VideoCameraMotion,
  type VideoDurationSeconds,
  type VideoMode,
  type VideoMotionPreset,
  type VideoMotionStrength,
  type VideoStyle,
  type VideoSubjectMotion,
} from "@/lib/video/promptBuilder";

const VIDEO_ASPECT_RATIO_OPTIONS = ["16:9", "9:16"] as const;
const MAX_REFERENCE_FRAMES = 3;
type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIO_OPTIONS)[number];
type FrameSlot = "start" | "end" | "reference";

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
  cameraMotion: VideoCameraMotion;
  subjectMotion: VideoSubjectMotion;
  strictGarmentLock: boolean;
  strictAnchor: boolean;
  createdAt: string;
};

export default function VideoProjectPage() {
  const [backends, setBackends] = useState<AIBackend[]>([]);
  const [selectedBackendId, setSelectedBackendId] = useState("");
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [startFrameSelection, setStartFrameSelection] = useState<FrameSelection | null>(null);
  const [endFrameSelection, setEndFrameSelection] = useState<FrameSelection | null>(null);
  const [referenceFrameSelections, setReferenceFrameSelections] = useState<FrameSelection[]>([]);
  const [uploadSlot, setUploadSlot] = useState<FrameSlot>("start");
  const [videoMode, setVideoMode] = useState<VideoMode>("frame-based-megaska");
  const [motionPreset, setMotionPreset] = useState<VideoMotionPreset>("subtle-breathing");
  const [duration, setDuration] = useState<VideoDurationSeconds>(8);
  const [style, setStyle] = useState<VideoStyle>("realistic");
  const [motionStrength, setMotionStrength] = useState<VideoMotionStrength>("subtle");
  const [cameraMotion, setCameraMotion] = useState<VideoCameraMotion>("push");
  const [subjectMotion, setSubjectMotion] = useState<VideoSubjectMotion>("subtle");
  const [strictGarmentLock, setStrictGarmentLock] = useState(true);
  const [strictAnchor, setStrictAnchor] = useState(true);

  const strictMegaskaFidelity = strictAnchor && strictGarmentLock;
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

  function applyFrameSelection(slot: FrameSlot, frame: FrameSelection) {
    if (slot === "start") {
      setStartFrameSelection(frame);
      return;
    }
    if (slot === "end") {
      setEndFrameSelection(frame);
      return;
    }

    setReferenceFrameSelections((current) => {
      if (current.some((item) => item.imageUrl === frame.imageUrl)) {
        return current;
      }
      if (current.length >= MAX_REFERENCE_FRAMES) {
        return current;
      }
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

    applyFrameSelection(uploadSlot, {
      sourceGenerationId: null,
      imageUrl: payload.public_url,
      label: file.name,
    });
    setError(null);
  }

  async function handleGenerate() {
    if (!startFrameSelection?.imageUrl || !endFrameSelection?.imageUrl || isGenerating) return;

    try {
      setIsGenerating(true);
      setError(null);

      const response = await fetch("/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_backend_id: selectedBackendId || null,
          video_mode: videoMode,
          start_frame_url: startFrameSelection.imageUrl,
          start_frame_generation_id: startFrameSelection.sourceGenerationId,
          end_frame_url: endFrameSelection.imageUrl,
          end_frame_generation_id: endFrameSelection.sourceGenerationId,
          reference_frames: referenceFrameSelections.map((ref) => ({
            url: ref.imageUrl,
            generationId: ref.sourceGenerationId,
          })),
          master_image_url: startFrameSelection.imageUrl,
          source_generation_id: startFrameSelection.sourceGenerationId,
          motion_preset: motionPreset,
          duration_seconds: duration,
          style,
          motion_strength: motionStrength,
          camera_motion: cameraMotion,
          subject_motion: subjectMotion,
          strict_garment_lock: strictGarmentLock,
          strict_anchor: strictAnchor,
          aspect_ratio: aspectRatio,
          creative_notes: creativeNotes,
          requested_thumbnail_url: startFrameSelection.imageUrl,
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
          cameraMotion: VideoCameraMotion;
          subjectMotion: VideoSubjectMotion;
          strictGarmentLock: boolean;
          strictAnchor: boolean;
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
        cameraMotion: payload.videoMeta.cameraMotion,
        subjectMotion: payload.videoMeta.subjectMotion,
        strictGarmentLock: payload.videoMeta.strictGarmentLock,
        strictAnchor: payload.videoMeta.strictAnchor,
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

      const frameUrl = latestResult.thumbnailUrl || startFrameSelection?.imageUrl || latestResult.outputUrl;

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

  useEffect(() => {
    if (!strictMegaskaFidelity) return;

    if (videoMode !== "frame-based-megaska") {
      setVideoMode("frame-based-megaska");
    }

    if (motionStrength !== "subtle") {
      setMotionStrength("subtle");
    }

    if (subjectMotion === "moderate") {
      setSubjectMotion("subtle");
    }
  }, [motionStrength, strictMegaskaFidelity, subjectMotion, videoMode]);

  const canGenerate = Boolean(startFrameSelection?.imageUrl && endFrameSelection?.imageUrl && selectedBackendId);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/60 to-zinc-950 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Studio Project</p>
              <h1 className="text-3xl font-semibold text-white">Video Project</h1>
              <p className="text-sm text-zinc-300">
                Frame-based Megaska Video Engine. Select start/end frames from Image Project and animate with safe motion only.
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
              <h2 className="text-lg font-semibold text-white">1) Frame anchors</h2>
              <p className="text-sm text-zinc-400">
                Pick Start + End frames from Image Project history, then optionally add up to {MAX_REFERENCE_FRAMES} extra reference frames.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-cyan-400/30 bg-zinc-950/50 p-3">
                  <p className="text-xs uppercase text-cyan-300">Start frame (required)</p>
                  {startFrameSelection ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={startFrameSelection.imageUrl} alt="Start frame" className="mt-2 h-40 w-full rounded-md object-cover" />
                  ) : (
                    <div className="mt-2 h-40 rounded-md border border-dashed border-white/20" />
                  )}
                </div>
                <div className="rounded-lg border border-cyan-400/30 bg-zinc-950/50 p-3">
                  <p className="text-xs uppercase text-cyan-300">End frame (required)</p>
                  {endFrameSelection ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={endFrameSelection.imageUrl} alt="End frame" className="mt-2 h-40 w-full rounded-md object-cover" />
                  ) : (
                    <div className="mt-2 h-40 rounded-md border border-dashed border-white/20" />
                  )}
                </div>
              </div>

              {referenceFrameSelections.length ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {referenceFrameSelections.map((ref) => (
                    <div key={ref.imageUrl} className="rounded-md border border-white/10 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ref.imageUrl} alt="Reference frame" className="h-24 w-full rounded object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setReferenceFrameSelections((current) => current.filter((item) => item.imageUrl !== ref.imageUrl))
                        }
                        className="mt-2 w-full rounded border border-white/20 px-2 py-1 text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadSlot("start");
                    fileInputRef.current?.click();
                  }}
                  className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200"
                >
                  Upload Start Frame
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadSlot("end");
                    fileInputRef.current?.click();
                  }}
                  className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200"
                >
                  Upload End Frame
                </button>
                <button
                  type="button"
                  disabled={referenceFrameSelections.length >= MAX_REFERENCE_FRAMES}
                  onClick={() => {
                    setUploadSlot("reference");
                    fileInputRef.current?.click();
                  }}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-zinc-300 disabled:opacity-50"
                >
                  Upload Reference Frame
                </button>
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
                      <img src={imageUrl} alt="Frame candidate" className="h-32 w-full object-cover" />
                      <div className="space-y-1 p-2 text-xs">
                        <p className="line-clamp-2 text-zinc-200">{item.prompt || "Untitled"}</p>
                        {item.created_at ? <p className="text-zinc-400">{formatGeneratedAt(item.created_at)}</p> : null}
                        <div className="grid grid-cols-3 gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              applyFrameSelection("start", {
                                sourceGenerationId: item.id,
                                imageUrl,
                                label: item.prompt || "Gallery image",
                              })
                            }
                            className="rounded border border-cyan-400/40 px-1 py-1 text-[10px] text-cyan-200"
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              applyFrameSelection("end", {
                                sourceGenerationId: item.id,
                                imageUrl,
                                label: item.prompt || "Gallery image",
                              })
                            }
                            className="rounded border border-cyan-400/40 px-1 py-1 text-[10px] text-cyan-200"
                          >
                            End
                          </button>
                          <button
                            type="button"
                            disabled={referenceFrameSelections.length >= MAX_REFERENCE_FRAMES}
                            onClick={() =>
                              applyFrameSelection("reference", {
                                sourceGenerationId: item.id,
                                imageUrl,
                                label: item.prompt || "Gallery image",
                              })
                            }
                            className="rounded border border-white/20 px-1 py-1 text-[10px] text-zinc-200 disabled:opacity-50"
                          >
                            Ref
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-5">
              <h2 className="text-lg font-semibold text-white">2-5) Motion controls</h2>
              <p className="text-xs text-cyan-200">Default mode is the Frame-based Megaska Engine for maximum fidelity stability.</p>

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
                    <option key={modeOption} value={modeOption} disabled={strictMegaskaFidelity && modeOption === "creative-reinterpretation"}>
                      {getVideoModeLabel(modeOption)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Safe motion preset</span>
                <select
                  value={motionPreset}
                  onChange={(event) => setMotionPreset(event.target.value as VideoMotionPreset)}
                  className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm"
                >
                  {VIDEO_SAFE_MOTION_PRESETS.map((preset) => (
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Motion strength</span>
                  <select value={motionStrength} onChange={(event) => setMotionStrength(event.target.value as VideoMotionStrength)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                    {VIDEO_MOTION_STRENGTHS.map((strength) => (
                      <option key={strength} value={strength} disabled={strictMegaskaFidelity && strength !== "subtle"}>
                        {getMotionStrengthLabel(strength)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Camera motion</span>
                  <select value={cameraMotion} onChange={(event) => setCameraMotion(event.target.value as VideoCameraMotion)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                    {VIDEO_CAMERA_MOTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getCameraMotionLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="text-zinc-300">Subject motion</span>
                  <select value={subjectMotion} onChange={(event) => setSubjectMotion(event.target.value as VideoSubjectMotion)} className="w-full rounded-md border border-white/15 bg-zinc-950 px-3 py-2 text-sm">
                    {VIDEO_SUBJECT_MOTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getSubjectMotionLabel(option)}
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
              </div>

              <label className="flex items-center gap-3 rounded-md border border-cyan-400/20 bg-cyan-500/5 px-3 py-3 text-sm">
                <input type="checkbox" checked={strictAnchor} onChange={(event) => setStrictAnchor(event.target.checked)} className="h-4 w-4 accent-cyan-400" />
                <span className="text-zinc-200">Strict Megaska Fidelity (preserve same model, swimsuit, scene, composition)</span>
              </label>

              <label className="flex items-center gap-3 rounded-md border border-white/10 px-3 py-3 text-sm">
                <input type="checkbox" checked={strictGarmentLock} onChange={(event) => setStrictGarmentLock(event.target.checked)} className="h-4 w-4 accent-cyan-400" />
                <span className="text-zinc-200">Strict Garment Lock (exact swimsuit identity)</span>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="text-zinc-300">Instruction-only note (optional)</span>
                <textarea
                  rows={2}
                  value={creativeNotes}
                  onChange={(event) => setCreativeNotes(event.target.value)}
                  placeholder="e.g. subtle motion only, gentle pan, fabric breeze"
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
            <h2 className="text-lg font-semibold text-white">6-7) Preview output</h2>
            {startFrameSelection ? (
              <div className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Start frame</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={startFrameSelection.imageUrl} alt="Selected start" className="mt-2 h-44 w-full rounded-md object-cover" />
                <p className="mt-2 line-clamp-2 text-xs text-zinc-300">{startFrameSelection.label}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-zinc-400">Select start and end frames to begin.</div>
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
                  <p>Camera motion: {getCameraMotionLabel(latestResult.cameraMotion)}</p>
                  <p>Subject motion: {getSubjectMotionLabel(latestResult.subjectMotion)}</p>
                  <p>Generated: {formatGeneratedAt(latestResult.createdAt)}</p>
                </div>

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
