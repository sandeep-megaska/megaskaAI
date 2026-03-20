"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  clearIncomingVideoAssets,
  getIncomingVideoAssets,
  getStagedVideoAnchors,
  removeIncomingVideoAsset,
  type StagedImageAsset,
} from "@/lib/studio/internalAssetBridge";
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
  isExperimental?: boolean;
  isLegacy?: boolean;
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
  motionPlanVersion?: string;
  motionCategory?: "micro-motion" | "pose-transition" | "limb-motion" | "interaction-motion" | "sequence-motion";
  anchorSuitabilityStatus?: "valid" | "weak" | "incompatible";
  anchorGapLevel?: "low" | "medium" | "high";
  motionWarnings?: string[];
  protectedCoreFlowEnabled?: boolean;
  experimentalLayerEnabled?: boolean;
  experimentalToggleUsed?: boolean;
  sceneMismatchRisk?: "low" | "medium" | "high";
  promptSceneIntent?: { family?: string; class?: string };
  anchorSceneGuess?: { family?: string; class?: string };
  sceneMismatchNotes?: string[];
  generationId: string;
  outputUrl: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  motionStrength: VideoMotionStrength;
  motionRiskLevel?: MotionRiskLevel;
  compatibilityWarnings?: string[];
  usedCompatibilityFallback?: boolean;
  evaluationStatus?: "pending" | "completed" | "failed";
  evaluator?: {
    overallScore?: number;
    identityScore?: number;
    garmentScore?: number;
    sceneScore?: number;
    confidence?: "low" | "medium" | "high";
    recommendation?: "pass" | "review" | "fail";
    warnings?: string[];
  };
  decompositionEnabled?: boolean;
  shotPlan?: Array<{
    shotId: string;
    sequenceIndex: number;
    title: string;
    actionPrompt: string;
    providerPreference: string;
    status: string;
    selectedCandidateId?: string | null;
  }>;
  shotCandidates?: Array<{
    candidateId: string;
    shotId: string;
    outputUrl: string;
    backendLabel: string;
  }>;
  sequence?: {
    sequenceId: string;
    sequenceStatus: string;
    stitchStatus: string;
    stitchedVideoUrl?: string | null;
  };
  createdAt: string;
};

type VideoGalleryItem = {
  id: string;
  prompt: string;
  created_at?: string | null;
  asset_url?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  video_meta?: Record<string, unknown> | null;
};

function getPresetOptions(priority: VideoFidelityPriority): readonly VideoMotionPreset[] {
  if (priority === "maximum-fidelity") return VIDEO_STRICT_SAFE_MOTION_PRESETS;
  if (priority === "maximum-motion") return [...VIDEO_ANCHORED_SAFE_MOTION_PRESETS, ...VIDEO_EXPERIMENTAL_MOTION_PRESETS];
  return VIDEO_ANCHORED_SAFE_MOTION_PRESETS;
}

function evaluatorBadgeClass(recommendation?: "pass" | "review" | "fail") {
  if (recommendation === "pass") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (recommendation === "fail") return "border-rose-400/40 bg-rose-500/10 text-rose-200";
  return "border-amber-400/40 bg-amber-500/10 text-amber-200";
}

export default function VideoProjectPage() {
  const VIDEO_GALLERY_PAGE_SIZE = 8;
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
  const [autoDecomposeShots, setAutoDecomposeShots] = useState(false);
  const [experimentalSceneHandling, setExperimentalSceneHandling] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<VideoResult | null>(null);
  const [history, setHistory] = useState<VideoResult[]>([]);
  const [videoGalleryItems, setVideoGalleryItems] = useState<VideoGalleryItem[]>([]);
  const [videoGalleryPage, setVideoGalleryPage] = useState(0);
  const [hasMoreVideoGalleryItems, setHasMoreVideoGalleryItems] = useState(true);
  const [isLoadingMoreVideoGallery, setIsLoadingMoreVideoGallery] = useState(false);
  const [incomingImageAssets, setIncomingImageAssets] = useState<StagedImageAsset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const videoBackends = useMemo(() => backends.filter((backend) => backend.type === "video"), [backends]);
  const recommendedBackends = useMemo(() => videoBackends.filter((backend) => !backend.isExperimental), [videoBackends]);
  const experimentalBackends = useMemo(() => videoBackends.filter((backend) => backend.isExperimental), [videoBackends]);
  const selectedBackend = useMemo(() => videoBackends.find((backend) => backend.id === selectedBackendId) ?? null, [videoBackends, selectedBackendId]);
  const motionRiskLevel = useMemo(() => classifyMotionRiskFromActionPrompt(actionPrompt), [actionPrompt]);

  useEffect(() => {
    if (videoBackends.length && !videoBackends.some((backend) => backend.id === selectedBackendId)) {
      setSelectedBackendId(videoBackends.find((backend) => backend.id === "veo-2")?.id ?? videoBackends[0].id);
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

  const loadVideoGallery = useCallback(
    async (page: number, reset = false) => {
      if (!supabase) return;
      const from = page * VIDEO_GALLERY_PAGE_SIZE;
      const to = from + VIDEO_GALLERY_PAGE_SIZE - 1;
      const { data } = await supabase
        .from("generations")
        .select("id,prompt,created_at,asset_url,url,thumbnail_url,video_meta,generation_kind")
        .eq("generation_kind", "video")
        .order("created_at", { ascending: false })
        .range(from, to);

      const nextItems = (data ?? []) as VideoGalleryItem[];
      setVideoGalleryItems((current) => {
        if (reset) return nextItems;
        const existingIds = new Set(current.map((item) => item.id));
        const deduped = nextItems.filter((item) => !existingIds.has(item.id));
        return [...current, ...deduped];
      });
      setVideoGalleryPage(page + 1);
      setHasMoreVideoGalleryItems(nextItems.length === VIDEO_GALLERY_PAGE_SIZE);
    },
    [VIDEO_GALLERY_PAGE_SIZE, supabase],
  );

  const formatGeneratedAt = useCallback((value?: string | null) => {
    if (!value) return "Generated: —";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Generated: —";
    return `Generated: ${new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed)}`;
  }, []);

  useEffect(() => {
    void loadGalleryImages();
    setVideoGalleryPage(0);
    void loadVideoGallery(0, true);
    async function loadBackends() {
      const response = await fetch("/api/ai/backends");
      const payload = (await response.json()) as { data?: AIBackend[] };
      setBackends(payload.data ?? []);
    }
    void loadBackends();
  }, [loadGalleryImages, loadVideoGallery]);

  useEffect(() => {
    const merged = [...getIncomingVideoAssets(), ...getStagedVideoAnchors()].reduce<StagedImageAsset[]>((acc, item) => {
      if (acc.some((asset) => asset.id === item.id || asset.url === item.url)) return acc;
      return [...acc, item];
    }, []);
    setIncomingImageAssets(merged);
  }, []);

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
          decomposition_enabled: autoDecomposeShots,
          experimental_scene_handling: experimentalSceneHandling,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        generationId?: string;
        outputUrl?: string;
        downloadUrl?: string;
        thumbnailUrl?: string;
        error?: string;
        videoMeta?: {
          motionPreset: VideoMotionPreset;
          durationSeconds: VideoDurationSeconds;
          motionStrength: VideoMotionStrength;
          motionRiskLevel?: MotionRiskLevel;
          motionPlanVersion?: string;
          motionCategory?: VideoResult["motionCategory"];
          anchorSuitabilityStatus?: VideoResult["anchorSuitabilityStatus"];
          anchorGapLevel?: VideoResult["anchorGapLevel"];
          motionWarnings?: string[];
          compatibilityWarnings?: string[];
          usedCompatibilityFallback?: boolean;
          evaluationStatus?: "pending" | "completed" | "failed";
          evaluator?: VideoResult["evaluator"];
          decompositionEnabled?: boolean;
          shotPlan?: VideoResult["shotPlan"];
          shotCandidates?: VideoResult["shotCandidates"];
          sequence?: VideoResult["sequence"];
          protectedCoreFlowEnabled?: boolean;
          experimentalLayerEnabled?: boolean;
          experimentalToggleUsed?: boolean;
          sceneMismatchRisk?: "low" | "medium" | "high";
          promptSceneIntent?: { family?: string; class?: string };
          anchorSceneGuess?: { family?: string; class?: string };
          sceneMismatchNotes?: string[];
        };
      };
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
        motionPlanVersion: payload.videoMeta.motionPlanVersion,
        motionCategory: payload.videoMeta.motionCategory,
        anchorSuitabilityStatus: payload.videoMeta.anchorSuitabilityStatus,
        anchorGapLevel: payload.videoMeta.anchorGapLevel,
        motionWarnings: payload.videoMeta.motionWarnings,
        compatibilityWarnings: payload.videoMeta.compatibilityWarnings,
        usedCompatibilityFallback: payload.videoMeta.usedCompatibilityFallback,
        evaluationStatus: payload.videoMeta.evaluationStatus,
        evaluator: payload.videoMeta.evaluator,
        decompositionEnabled: payload.videoMeta.decompositionEnabled,
        shotPlan: payload.videoMeta.shotPlan,
        shotCandidates: payload.videoMeta.shotCandidates,
        sequence: payload.videoMeta.sequence,
        protectedCoreFlowEnabled: payload.videoMeta.protectedCoreFlowEnabled,
        experimentalLayerEnabled: payload.videoMeta.experimentalLayerEnabled,
        experimentalToggleUsed: payload.videoMeta.experimentalToggleUsed,
        sceneMismatchRisk: payload.videoMeta.sceneMismatchRisk,
        promptSceneIntent: payload.videoMeta.promptSceneIntent,
        anchorSceneGuess: payload.videoMeta.anchorSceneGuess,
        sceneMismatchNotes: payload.videoMeta.sceneMismatchNotes,
        createdAt: new Date().toISOString(),
      };

      setLatestResult(result);
      setHistory((current) => [result, ...current]);
      setVideoGalleryPage(0);
      await loadVideoGallery(0, true);
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

  async function handleLoadMoreVideoGallery() {
    if (isLoadingMoreVideoGallery || !hasMoreVideoGalleryItems) return;
    setIsLoadingMoreVideoGallery(true);
    try {
      await loadVideoGallery(videoGalleryPage, false);
    } finally {
      setIsLoadingMoreVideoGallery(false);
    }
  }

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
            <div className="space-y-3 rounded-lg border border-white/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Incoming from Image Project</h2>
                <button
                  type="button"
                  onClick={() => {
                    clearIncomingVideoAssets();
                    setIncomingImageAssets([]);
                  }}
                  className="rounded border border-white/20 px-2 py-1 text-[10px]"
                >
                  Clear sent queue
                </button>
              </div>
              <p className="text-xs text-zinc-400">Assign incoming images as first/last/identity anchors or add as references without re-uploading.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {incomingImageAssets.map((item) => {
                  const frame = { sourceGenerationId: item.id, imageUrl: item.url, label: item.prompt || "Incoming image" };
                  return (
                    <div key={`incoming-${item.id}`} className="rounded border border-white/10 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.prompt} className="h-20 w-full rounded object-cover" />
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button type="button" onClick={() => applyFrameSelection("first", frame)} className="rounded border border-cyan-400/40 px-2 text-[10px]">first</button>
                        <button type="button" onClick={() => applyFrameSelection("last", frame)} className="rounded border border-cyan-400/40 px-2 text-[10px]">last</button>
                        <button type="button" onClick={() => applyFrameSelection("identity", frame)} className="rounded border border-cyan-400/40 px-2 text-[10px]">identity</button>
                        <button type="button" onClick={() => applyFrameSelection("fit", frame)} className="rounded border border-cyan-400/40 px-2 text-[10px]">fit</button>
                        <button type="button" onClick={() => addReferenceImage(frame)} className="rounded border border-white/20 px-2 text-[10px]">add ref</button>
                        <button
                          type="button"
                          onClick={() => setIncomingImageAssets(removeIncomingVideoAsset(item.id))}
                          className="rounded border border-rose-400/40 px-2 text-[10px] text-rose-200"
                        >
                          remove
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!incomingImageAssets.length ? <p className="text-xs text-zinc-500">No incoming assets yet. Send images from Image Project gallery.</p> : null}
              </div>
            </div>

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
            <div className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              <span className="font-semibold">Protected Core Flow</span> · Identity/Garment Safe Path (first + last + identity anchors preserved by default).
            </div>
            <label className="flex items-center justify-between rounded-md border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm">
              <span>Auto decompose into shots</span>
              <input type="checkbox" checked={autoDecomposeShots} onChange={(e) => setAutoDecomposeShots(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              <span>Try scene-aware generation (experimental)</span>
              <input type="checkbox" checked={experimentalSceneHandling} onChange={(e) => setExperimentalSceneHandling(e.target.checked)} />
            </label>

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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
                <optgroup label="Recommended">
                  {recommendedBackends.map((backend) => <option key={backend.id} value={backend.id}>{backend.name}</option>)}
                </optgroup>
                <optgroup label="Experimental">
                  {experimentalBackends.map((backend) => <option key={backend.id} value={backend.id}>{backend.name}</option>)}
                </optgroup>
              </select>
            </label>

            {selectedBackend?.isExperimental ? <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">This provider may require compatibility fallback and may drift more under complex motion.</p> : null}
            {motionRiskLevel === "high" ? <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">High motion increases garment and identity drift risk.</p> : null}
            {latestResult?.sceneMismatchRisk === "high" ? <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">Prompt scene may not match anchor scene; intro drift risk is higher.</p> : null}
            {latestResult?.motionCategory ? (
              <div className="grid gap-2 rounded-md border border-cyan-400/20 bg-cyan-500/5 p-2 text-xs text-cyan-100 sm:grid-cols-3">
                <p>Motion: <span className="font-semibold">{latestResult.motionCategory}</span></p>
                <p>Risk: <span className="font-semibold">{latestResult.motionRiskLevel ?? "n/a"}</span></p>
                <p>Anchor suitability: <span className="font-semibold">{latestResult.anchorSuitabilityStatus ?? "n/a"}</span></p>
              </div>
            ) : null}

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
                {latestResult.decompositionEnabled && latestResult.sequence ? (
                  <div className="rounded-md border border-white/10 bg-zinc-900/80 p-2 text-xs">
                    <p className="font-medium text-zinc-200">
                      Shot Sequence · {latestResult.sequence.sequenceStatus} · Stitch: {latestResult.sequence.stitchStatus}
                    </p>
                    <div className="mt-2 space-y-1">
                      {latestResult.shotPlan?.map((shot) => {
                        const selected = latestResult.shotCandidates?.find((candidate) => candidate.candidateId === shot.selectedCandidateId);
                        return (
                          <div key={shot.shotId} className="rounded border border-white/10 p-2">
                            <p>
                              #{shot.sequenceIndex + 1} · {shot.title}
                            </p>
                            <p className="text-zinc-400">{shot.actionPrompt}</p>
                            <p className="text-zinc-400">Route: {selected?.backendLabel ?? shot.providerPreference} · Status: {shot.status}</p>
                            {selected ? (
                              <video src={selected.outputUrl} controls className="mt-1 h-auto w-full rounded" />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <p className="text-xs">Risk: {latestResult.motionRiskLevel ?? "n/a"}</p>
                <p className="text-xs">Motion category: {latestResult.motionCategory ?? "n/a"}</p>
                <p className="text-xs">Anchor suitability: {latestResult.anchorSuitabilityStatus ?? "n/a"} · Gap: {latestResult.anchorGapLevel ?? "n/a"}</p>
                <p className="text-xs">Scene mismatch risk: {latestResult.sceneMismatchRisk ?? "n/a"}</p>
                {latestResult.usedCompatibilityFallback ? <p className="text-xs text-cyan-200">Used compatibility fallback for this provider.</p> : null}
                {latestResult.motionWarnings?.slice(0, 2).map((warning) => <p key={warning} className="text-xs text-cyan-200">• {warning}</p>)}
                {latestResult.compatibilityWarnings?.map((warning) => <p key={warning} className="text-xs text-amber-200">• {warning}</p>)}
                {latestResult.evaluationStatus === "completed" && latestResult.evaluator ? (
                  <div className="space-y-2 rounded-md border border-white/10 bg-zinc-900/70 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-zinc-200">Evaluator V1</p>
                      <span className={`rounded border px-2 py-0.5 uppercase tracking-wide ${evaluatorBadgeClass(latestResult.evaluator.recommendation)}`}>
                        {latestResult.evaluator.recommendation ?? "review"}
                      </span>
                    </div>
                    <p>
                      Overall Fidelity Score: <span className="font-semibold text-white">{latestResult.evaluator.overallScore ?? "n/a"}</span>
                    </p>
                    <p>
                      Identity: {latestResult.evaluator.identityScore ?? "n/a"} · Garment: {latestResult.evaluator.garmentScore ?? "n/a"} · Scene:{" "}
                      {latestResult.evaluator.sceneScore ?? "n/a"}
                    </p>
                    <p>Confidence: {latestResult.evaluator.confidence ?? "n/a"}</p>
                    {latestResult.evaluator.warnings?.[0] ? <p className="text-amber-100">Warning: {latestResult.evaluator.warnings[0]}</p> : null}
                  </div>
                ) : null}
                {latestResult.evaluationStatus === "failed" ? <p className="text-xs text-zinc-300">Evaluation unavailable for this result.</p> : null}
                <div className="flex gap-2">
                  <a href={latestResult.downloadUrl} download className="rounded-md border border-white/20 px-3 py-2 text-sm">Download</a>
                  <button type="button" onClick={() => router.push(`/?masterUrl=${encodeURIComponent(latestResult.thumbnailUrl ?? latestResult.outputUrl)}`)} className="rounded-md border border-cyan-400/50 px-3 py-2 text-sm text-cyan-200">Use Frame in Image Project</button>
                </div>
              </div>
            ) : <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-zinc-400">Your generated video will appear here.</div>}

            {history.length > 0 ? (
              <div className="space-y-2">
                {history
                  .slice()
                  .sort((a, b) => (b.evaluator?.overallScore ?? -1) - (a.evaluator?.overallScore ?? -1))
                  .slice(0, 4)
                  .map((item, idx) => (
                    <button key={item.generationId} onClick={() => setLatestResult(item)} className="w-full rounded-md border border-white/10 px-3 py-2 text-left text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span>{item.durationSeconds}s · {item.motionPreset}</span>
                        {item.evaluator?.overallScore != null ? <span>Score {item.evaluator.overallScore}</span> : null}
                      </div>
                      {idx === 0 && item.evaluator?.overallScore != null ? <p className="mt-1 text-[10px] text-cyan-200">Best candidate</p> : null}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-white/10 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Video Gallery</h2>
            <button type="button" onClick={() => { setVideoGalleryPage(0); void loadVideoGallery(0, true); }} className="rounded border border-white/20 px-3 py-1 text-xs">
              Refresh
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {videoGalleryItems.map((item) => {
              const videoUrl = item.asset_url || item.url;
              if (!videoUrl) return null;
              const videoMeta = item.video_meta ?? {};
              const backendLabel =
                typeof videoMeta["selectedBackendLabel"] === "string"
                  ? String(videoMeta["selectedBackendLabel"])
                  : typeof videoMeta["provider"] === "string"
                    ? String(videoMeta["provider"])
                    : "Unknown provider";
              return (
                <article key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60">
                  <div className="aspect-video bg-zinc-900">
                    <video src={videoUrl} poster={item.thumbnail_url ?? undefined} controls preload="metadata" className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="text-xs text-zinc-300">{item.prompt ? `${item.prompt.slice(0, 140)}${item.prompt.length > 140 ? "…" : ""}` : "No prompt available."}</p>
                    <p className="text-xs text-zinc-500">{formatGeneratedAt(item.created_at)}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <span className="rounded border border-white/10 px-2 py-0.5">{backendLabel}</span>
                      {typeof videoMeta["motionPreset"] === "string" ? <span className="rounded border border-white/10 px-2 py-0.5">{String(videoMeta["motionPreset"])}</span> : null}
                      {typeof videoMeta["evaluationStatus"] === "string" ? <span className="rounded border border-white/10 px-2 py-0.5">{String(videoMeta["evaluationStatus"])}</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`/api/studio/video/${item.id}/download`} className="rounded-md border border-white/20 px-3 py-2 text-xs">
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => router.push(`/?masterUrl=${encodeURIComponent(item.thumbnail_url ?? videoUrl)}&masterGenerationId=${encodeURIComponent(item.id)}&sourceVideoGenerationId=${encodeURIComponent(item.id)}&extractedAt=${encodeURIComponent(item.created_at ?? new Date().toISOString())}`)}
                        className="rounded-md border border-cyan-400/50 px-3 py-2 text-xs text-cyan-200"
                      >
                        Use Frame in Image Project
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMoreVideoGalleryItems ? (
            <button
              type="button"
              onClick={() => void handleLoadMoreVideoGallery()}
              disabled={isLoadingMoreVideoGallery}
              className="rounded-md border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
            >
              {isLoadingMoreVideoGallery ? "Loading..." : "Load more"}
            </button>
          ) : null}
        </section>
      </div>
    </main>
  );
}
