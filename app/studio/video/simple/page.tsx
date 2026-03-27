"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadDistinctImageGenerationAssets, type ImageGenerationAsset } from "@/lib/studio/imageGenerationAssets";
import {
  createEmptyGarmentAnchors,
  type VideoSimpleGarmentAnchors,
  type VideoSimpleMotionPreset,
  type VideoSimpleReferenceRole,
  validateVideoSimpleControls,
  VIDEO_SIMPLE_MOTION_PRESETS,
} from "@/lib/video/simpleControls";

type VideoAspectRatio = "16:9" | "9:16";
type VideoDuration = 4 | 6 | 8;

type SimpleVideoResponse = {
  success?: boolean;
  error?: string;
  data?: {
    video_url?: string;
    model?: string;
    duration_seconds?: number;
    aspect_ratio?: VideoAspectRatio;
    compiled_prompt?: string;
    controls?: {
      motion_preset?: VideoSimpleMotionPreset;
      reference_count?: number;
      has_start_frame?: boolean;
      has_end_frame?: boolean;
      garment_anchor_count?: number;
    };
  };
};

type GalleryImageItem = ImageGenerationAsset;

type FrameAsset = {
  id: string;
  url: string;
  label: string;
};

type PickerTarget = { kind: "start" | "end" } | { kind: "reference"; index: number };

const REFERENCE_SLOTS: Array<{ label: string; role: VideoSimpleReferenceRole; hint: string }> = [
  { label: "Front Reference", role: "front", hint: "Primary front garment view" },
  { label: "Back Reference", role: "back", hint: "Back neckline and strap details" },
  { label: "Optional Side / 3/4", role: "side", hint: "Optional side or angled continuity" },
];

const MOTION_PRESET_LABELS: Record<VideoSimpleMotionPreset, string> = {
  freeform: "Freeform",
  "slow-pivot": "Slow pivot",
  "turn-and-settle": "Turn and settle",
  "camera-orbit": "Camera orbit",
  "back-reveal-hold": "Back reveal hold",
  "over-shoulder-reveal": "Over-shoulder reveal",
};

function resolveImageAspectRatio(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        resolve(null);
        return;
      }
      resolve(image.naturalWidth / image.naturalHeight);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export default function SimpleVideoStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<VideoDuration>(6);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [startFrame, setStartFrame] = useState<FrameAsset | null>(null);
  const [endFrame, setEndFrame] = useState<FrameAsset | null>(null);
  const [startFrameAspectRatio, setStartFrameAspectRatio] = useState<number | null>(null);
  const [endFrameAspectRatio, setEndFrameAspectRatio] = useState<number | null>(null);
  const [referenceImages, setReferenceImages] = useState<Array<FrameAsset | null>>(REFERENCE_SLOTS.map(() => null));
  const [motionPreset, setMotionPreset] = useState<VideoSimpleMotionPreset>("freeform");
  const [garmentAnchors, setGarmentAnchors] = useState<VideoSimpleGarmentAnchors>(() => createEmptyGarmentAnchors());
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    model: string;
    duration: number;
    aspectRatio: VideoAspectRatio;
    controls: NonNullable<SimpleVideoResponse["data"]>["controls"];
    compiledPrompt: string;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isDownloading, setIsDownloading] = useState(false);

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const activeReferenceImages = useMemo(
    () =>
      referenceImages
        .map((item, index) => (item ? { ...item, role: REFERENCE_SLOTS[index].role } : null))
        .filter(Boolean) as Array<FrameAsset & { role: VideoSimpleReferenceRole }>,
    [referenceImages],
  );

  const preflightWarnings = useMemo(
    () =>
      validateVideoSimpleControls({
        prompt,
        motionPreset,
        startFrameAspectRatio,
        endFrameAspectRatio,
        hasEndFrame: Boolean(endFrame),
        referenceImages: activeReferenceImages.map((item) => ({ url: item.url, role: item.role })),
        garmentAnchors,
      }),
    [activeReferenceImages, endFrame, endFrameAspectRatio, garmentAnchors, motionPreset, prompt, startFrameAspectRatio],
  );

  const loadGalleryImages = useCallback(async () => {
    if (!supabase) return;
    const assets = await loadDistinctImageGenerationAssets(supabase, { queryLimit: 180, maxResults: 90 });
    setGalleryImages(assets);
  }, [supabase]);

  useEffect(() => {
    void loadGalleryImages();
  }, [loadGalleryImages]);

  async function applyFrameSelection(item: GalleryImageItem) {
    const imageUrl = item.asset_url ?? item.url;
    if (!imageUrl || !pickerTarget) return;

    const selection: FrameAsset = {
      id: item.id,
      url: imageUrl,
      label: item.prompt || "Gallery image",
    };

    const aspect = await resolveImageAspectRatio(imageUrl);

    if (pickerTarget.kind === "start") {
      setStartFrame(selection);
      setStartFrameAspectRatio(aspect);
    } else if (pickerTarget.kind === "end") {
      setEndFrame(selection);
      setEndFrameAspectRatio(aspect);
    } else {
      setReferenceImages((current) => {
        const next = [...current];
        next[pickerTarget.index] = selection;
        return next;
      });
    }

    setPickerTarget(null);
  }

  function updateGarmentAnchor<K extends keyof VideoSimpleGarmentAnchors>(key: K, value: string) {
    setGarmentAnchors((current) => ({ ...current, [key]: value }));
  }

  function moveReferenceImage(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= REFERENCE_SLOTS.length) return;
    setReferenceImages((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError("Enter a prompt first.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/studio/video/simple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          duration_seconds: duration,
          aspect_ratio: aspectRatio,
          first_frame_url: startFrame?.url ?? null,
          last_frame_url: endFrame?.url ?? null,
          motion_preset: motionPreset,
          reference_images: activeReferenceImages.map((item) => ({ url: item.url, role: item.role })),
          garment_anchors: garmentAnchors,
        }),
      });

      const payload = (await response.json()) as SimpleVideoResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to generate video.");
      }

      const generatedUrl = payload.data?.video_url ?? null;
      if (!generatedUrl) {
        throw new Error("Video generation succeeded but no video URL was returned.");
      }

      setVideoUrl(generatedUrl);
      setMeta({
        model: payload.data?.model ?? "unknown",
        duration: payload.data?.duration_seconds ?? duration,
        aspectRatio: payload.data?.aspect_ratio ?? aspectRatio,
        compiledPrompt: payload.data?.compiled_prompt ?? prompt.trim(),
        controls: payload.data?.controls,
      });
      setCopyStatus("idle");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Failed to generate video.");
    } finally {
      setIsGenerating(false);
    }
  }

  function buildDownloadFilename(url: string) {
    try {
      const parsedUrl = new URL(url);
      const pathnameName = parsedUrl.pathname.split("/").pop() || "generated-video.mp4";
      return pathnameName.includes(".") ? pathnameName : `${pathnameName}.mp4`;
    } catch {
      return "generated-video.mp4";
    }
  }

  async function handleCopyVideoUrl() {
    if (!videoUrl) return;
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  async function handleDownloadVideo() {
    if (!videoUrl) return;
    setIsDownloading(true);
    const filename = buildDownloadFilename(videoUrl);
    try {
      const isSameOrigin = new URL(videoUrl, window.location.href).origin === window.location.origin;
      if (isSameOrigin) {
        const link = document.createElement("a");
        link.href = videoUrl;
        link.download = filename;
        link.rel = "noreferrer";
        document.body.append(link);
        link.click();
        link.remove();
        return;
      }

      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error("Fetch failed");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");
      link.href = videoUrl;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
          <header className="mb-6 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Simple Video</p>
            <h1 className="text-3xl font-semibold">Standalone video generator</h1>
            <p className="text-sm text-zinc-400">Generate a single clip directly from provider APIs, without Studio V2 orchestration.</p>
          </header>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="h-32 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-400/50 focus:ring"
                placeholder="Describe the motion, subject behavior, and camera movement."
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-200">Duration</span>
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value) as VideoDuration)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                  <option value={4}>4s</option>
                  <option value={6}>6s</option>
                  <option value={8}>8s</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-200">Aspect ratio</span>
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as VideoAspectRatio)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { key: "start", label: "Start frame (optional)", value: startFrame },
                { key: "end", label: "End frame (optional)", value: endFrame },
              ].map((slot) => (
                <div key={slot.key} className="space-y-2">
                  <span className="text-sm font-medium text-zinc-200">{slot.label}</span>
                  <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {slot.value ? <img src={slot.value.url} alt={slot.label} className="h-28 w-full rounded-lg object-cover" /> : <div className="h-28 rounded-lg border border-dashed border-zinc-700" />}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPickerTarget({ kind: slot.key as "start" | "end" })}
                        className="w-full rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
                      >
                        Choose from Image Project
                      </button>
                      {slot.value ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (slot.key === "start") {
                              setStartFrame(null);
                              setStartFrameAspectRatio(null);
                            } else {
                              setEndFrame(null);
                              setEndFrameAspectRatio(null);
                            }
                          }}
                          className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-100">Reference Images (optional)</h2>
                <p className="text-xs text-zinc-400">Add up to 3 references to improve garment continuity and back-view preservation.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {REFERENCE_SLOTS.map((slot, index) => {
                  const value = referenceImages[index];
                  return (
                    <div key={slot.role} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                      <div className="mb-1 text-xs font-medium text-zinc-200">{slot.label}</div>
                      <p className="mb-2 text-[11px] text-zinc-500">{slot.hint}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {value ? <img src={value.url} alt={slot.label} className="h-20 w-full rounded object-cover" /> : <div className="h-20 rounded border border-dashed border-zinc-700" />}
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setPickerTarget({ kind: "reference", index })}
                          className="col-span-2 rounded-md border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20"
                        >
                          Choose
                        </button>
                        <button
                          type="button"
                          onClick={() => moveReferenceImage(index, -1)}
                          disabled={index === 0 || !value}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          Move ←
                        </button>
                        <button
                          type="button"
                          onClick={() => moveReferenceImage(index, 1)}
                          disabled={index === REFERENCE_SLOTS.length - 1 || !value}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          Move →
                        </button>
                        {value ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImages((current) => {
                                const next = [...current];
                                next[index] = null;
                                return next;
                              });
                            }}
                            className="col-span-2 rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-200">Motion preset</span>
              <select
                value={motionPreset}
                onChange={(event) => setMotionPreset(event.target.value as VideoSimpleMotionPreset)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              >
                {VIDEO_SIMPLE_MOTION_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {MOTION_PRESET_LABELS[preset]}
                  </option>
                ))}
              </select>
            </label>

            <details className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-200">Garment Anchors (optional)</summary>
              <p className="mt-2 text-xs text-zinc-400">Add only key garment details you want preserved. Keep each field concise.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-zinc-300">Back neckline / back cut</span>
                  <input value={garmentAnchors.backNeckline} onChange={(event) => updateGarmentAnchor("backNeckline", event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-300">Strap structure</span>
                  <input value={garmentAnchors.strapStructure} onChange={(event) => updateGarmentAnchor("strapStructure", event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-300">Back coverage / silhouette</span>
                  <input value={garmentAnchors.backCoverage} onChange={(event) => updateGarmentAnchor("backCoverage", event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-300">Seam lines / paneling</span>
                  <input value={garmentAnchors.seamLines} onChange={(event) => updateGarmentAnchor("seamLines", event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-300">Fabric finish / texture</span>
                  <input value={garmentAnchors.fabricFinish} onChange={(event) => updateGarmentAnchor("fabricFinish", event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-zinc-300">Color / print continuity</span>
                  <input value={garmentAnchors.colorContinuity} onChange={(event) => updateGarmentAnchor("colorContinuity", event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs" />
                </label>
              </div>
            </details>

            {preflightWarnings.length ? (
              <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                <p className="font-medium">Preflight tips</p>
                <ul className="list-disc space-y-1 pl-4">
                  {preflightWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="rounded-xl border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Generating..." : "Generate clip"}
            </button>

            {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
          <header className="mb-4">
            <h2 className="text-lg font-semibold">Output panel</h2>
            <p className="text-sm text-zinc-400">The latest generated clip appears here.</p>
          </header>

          {isGenerating ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/60 p-4 text-sm text-zinc-300">Generating clip… this can take a minute.</div>
          ) : null}

          {!isGenerating && videoUrl ? (
            <div className="space-y-3">
              <video className="w-full rounded-xl border border-zinc-700 bg-black" src={videoUrl} controls playsInline />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadVideo()}
                  disabled={isDownloading}
                  className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDownloading ? "Downloading..." : "Download video"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyVideoUrl()}
                  className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  {copyStatus === "copied" ? "URL copied" : copyStatus === "error" ? "Copy failed" : "Copy video URL"}
                </button>
                <a href={videoUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">
                  Open video URL
                </a>
              </div>
              {meta ? <p className="text-xs text-zinc-400">{meta.model} · {meta.duration}s · {meta.aspectRatio}</p> : null}
              {meta?.controls ? (
                <div className="flex flex-wrap gap-2 text-[11px] text-zinc-300">
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5">Preset: {MOTION_PRESET_LABELS[meta.controls.motion_preset ?? "freeform"]}</span>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5">Refs: {meta.controls.reference_count ?? 0}</span>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5">Start: {meta.controls.has_start_frame ? "Yes" : "No"}</span>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5">End: {meta.controls.has_end_frame ? "Yes" : "No"}</span>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5">Anchors: {meta.controls.garment_anchor_count ?? 0}</span>
                </div>
              ) : null}
              {meta?.compiledPrompt ? (
                <details className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
                  <summary className="cursor-pointer text-xs text-zinc-300">Compiled request prompt</summary>
                  <p className="mt-2 text-xs text-zinc-400">{meta.compiledPrompt}</p>
                </details>
              ) : null}
            </div>
          ) : null}

          {!isGenerating && !videoUrl ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/60 p-4 text-sm text-zinc-400">No output yet. Generate a clip to populate this panel.</div>
          ) : null}
        </aside>
      </div>

      {pickerTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">
                Choose {pickerTarget.kind === "start" ? "start" : pickerTarget.kind === "end" ? "end" : REFERENCE_SLOTS[pickerTarget.index].label} from Image Project
              </h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => void loadGalleryImages()} className="rounded-md border border-zinc-600 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">Refresh</button>
                <button type="button" onClick={() => setPickerTarget(null)} className="rounded-md border border-zinc-600 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">Close</button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {galleryImages.map((item) => {
                  const imageUrl = item.asset_url ?? item.url;
                  if (!imageUrl) return null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void applyFrameSelection(item)}
                      className="rounded border border-white/10 p-1 text-left hover:border-cyan-400/60"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="Gallery" className="h-28 w-full rounded object-cover" />
                      <p className="mt-1 line-clamp-2 text-[10px] text-zinc-300">{item.prompt || "Gallery image"}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
