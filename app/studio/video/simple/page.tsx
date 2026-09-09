"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Film,
  ImageIcon,
  ImagePlus,
  RefreshCw,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import DownloadAssetButton from "@/app/studio/video/v2/components/DownloadAssetButton";
import ActionMenu from "@/components/ui/ActionMenu";
import Alert from "@/components/ui/Alert";
import AssetSlot from "@/components/ui/AssetSlot";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import GeneratingPanel from "@/components/ui/GeneratingPanel";
import MediaFrame from "@/components/ui/MediaFrame";
import Modal from "@/components/ui/Modal";
import PageShell from "@/components/ui/PageShell";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Badge, Card, EmptyState, SectionHeading, Well } from "@/components/ui/Surface";
import { revealResults } from "@/components/ui/revealResults";
import { loadDistinctImageGenerationAssets, type ImageGenerationAsset } from "@/lib/studio/imageGenerationAssets";
import {
  createEmptyGarmentAnchors,
  createWorkflowGroupId,
  type VideoSimpleGarmentAnchors,
  type VideoSimpleMotionPreset,
  type VideoSimpleReferenceRole,
  type VideoSimpleShotType,
  type VideoSimpleWorkflowMode,
  validateVideoSimpleControls,
  VIDEO_SIMPLE_MOTION_PRESETS,
} from "@/lib/video/simpleControls";

type VideoAspectRatio = "16:9" | "9:16";
type VideoDuration = 4 | 6 | 8;

type SimpleVideoResponse = {
  success?: boolean;
  error?: string;
  error_code?: string;
  max_mb?: number;
  data?: {
    generation_id?: string;
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
      workflow_mode?: VideoSimpleWorkflowMode;
      shot_type?: VideoSimpleShotType;
      workflow_group_id?: string | null;
    };
  };
};

type PromptBuilderResponse = {
  success?: boolean;
  error?: string;
  data?: {
    summary: string;
    riskLevel: "low" | "medium" | "high";
    recommendedMode: "single_shot" | "two_shot";
    imagePrompt: string;
    videoPrompt: string;
    negativeConstraints: string[];
    shotNotes: string[];
  };
};

function normalizeUploadLimitError(input: { error?: string; error_code?: string; max_mb?: number }) {
  if (input.error_code !== "upload-limit-exceeded") return input.error ?? "Failed to generate video.";
  const maxMb = typeof input.max_mb === "number" ? input.max_mb.toFixed(2) : null;
  return maxMb
    ? `Generated video is larger than the upload limit (${maxMb} MB max). Try a shorter duration or simpler motion.`
    : "Generated video is larger than the upload limit. Try a shorter duration or simpler motion.";
}

type GalleryImageItem = ImageGenerationAsset;

type FrameAsset = {
  id: string;
  url: string;
  label: string;
};

type PickerTarget = { kind: "start" | "intermediate" | "end" } | { kind: "reference"; index: number };

type ShotDescriptor = {
  shotType: Extract<VideoSimpleShotType, "shot-a" | "shot-b">;
  label: string;
  flowLabel: string;
  helper: string;
};

type OutputItem = {
  generationId: string;
  videoUrl: string;
  createdAt: string;
  model: string;
  duration: number;
  aspectRatio: VideoAspectRatio;
  compiledPrompt: string;
  controls: NonNullable<SimpleVideoResponse["data"]>["controls"];
};

type PersistedSimpleVideoItem = {
  id: string;
  prompt: string;
  created_at?: string | null;
  asset_url?: string | null;
  url?: string | null;
  video_meta?: Record<string, unknown> | null;
};

const SHOT_DESCRIPTORS: ShotDescriptor[] = [
  {
    shotType: "shot-a",
    label: "Shot 1",
    flowLabel: "Front → Mid",
    helper: "Start frame to Intermediate Anchor for a controlled partial reveal.",
  },
  {
    shotType: "shot-b",
    label: "Shot 2",
    flowLabel: "Mid → Back",
    helper: "Intermediate Anchor to End frame for the final back reveal.",
  },
];

const REFERENCE_SLOTS: Array<{ label: string; role: VideoSimpleReferenceRole; hint: string }> = [
  { label: "Front Reference", role: "front", hint: "Primary front garment view" },
  { label: "Back Reference", role: "back", hint: "Back neckline and strap details" },
  { label: "Optional Side / 3/4", role: "side", hint: "Optional side or angled continuity" },
];

const GARMENT_ANCHOR_FIELDS: Array<{
  key: keyof VideoSimpleGarmentAnchors;
  label: string;
  placeholder: string;
}> = [
  { key: "backNeckline", label: "Back neckline", placeholder: "Deep scoop, no closure" },
  { key: "strapStructure", label: "Strap structure", placeholder: "Thin crossed straps" },
  { key: "backCoverage", label: "Back coverage", placeholder: "High-cut, full seat coverage" },
  { key: "seamLines", label: "Seam lines", placeholder: "Single centre seam" },
  { key: "fabricFinish", label: "Fabric finish", placeholder: "Matte, slight stretch" },
  { key: "colorContinuity", label: "Colour continuity", placeholder: "Solid emerald, no print" },
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

function readMetaString(videoMeta: Record<string, unknown> | null | undefined, key: string) {
  const value = videoMeta?.[key];
  return typeof value === "string" ? value : "";
}

function readMetaNumber(videoMeta: Record<string, unknown> | null | undefined, key: string, fallback: number) {
  const value = videoMeta?.[key];
  return typeof value === "number" ? value : fallback;
}

function asValidAspectRatio(value: string): VideoAspectRatio {
  return value === "16:9" ? "16:9" : "9:16";
}

export default function SimpleVideoStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<VideoDuration>(6);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [workflowMode, setWorkflowMode] = useState<VideoSimpleWorkflowMode>("single-shot");
  const [workflowGroupId, setWorkflowGroupId] = useState<string>(() => createWorkflowGroupId());

  const [startFrame, setStartFrame] = useState<FrameAsset | null>(null);
  const [intermediateFrame, setIntermediateFrame] = useState<FrameAsset | null>(null);
  const [endFrame, setEndFrame] = useState<FrameAsset | null>(null);
  const [startFrameAspectRatio, setStartFrameAspectRatio] = useState<number | null>(null);
  const [intermediateFrameAspectRatio, setIntermediateFrameAspectRatio] = useState<number | null>(null);
  const [endFrameAspectRatio, setEndFrameAspectRatio] = useState<number | null>(null);

  const [referenceImages, setReferenceImages] = useState<Array<FrameAsset | null>>(REFERENCE_SLOTS.map(() => null));
  const [motionPreset, setMotionPreset] = useState<VideoSimpleMotionPreset>("freeform");
  const [garmentAnchors, setGarmentAnchors] = useState<VideoSimpleGarmentAnchors>(() => createEmptyGarmentAnchors());

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([]);
  const [historyItems, setHistoryItems] = useState<PersistedSimpleVideoItem[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isBuildingPrompt, setIsBuildingPrompt] = useState(false);
  const [promptBuilderResult, setPromptBuilderResult] = useState<PromptBuilderResponse["data"] | null>(null);
  const [promptBuilderInlineError, setPromptBuilderInlineError] = useState<string | null>(null);
  const [activeShot, setActiveShot] = useState<VideoSimpleShotType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const latestOutput = outputs[0] ?? null;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeletingHistoryId, setIsDeletingHistoryId] = useState<string | null>(null);
  const [pendingHistoryDelete, setPendingHistoryDelete] = useState<PersistedSimpleVideoItem | null>(null);

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
        workflowMode,
        startFrameAspectRatio,
        intermediateFrameAspectRatio,
        endFrameAspectRatio,
        hasIntermediateFrame: Boolean(intermediateFrame),
        hasEndFrame: Boolean(endFrame),
        referenceImages: activeReferenceImages.map((item) => ({ url: item.url, role: item.role })),
        garmentAnchors,
      }),
    [
      activeReferenceImages,
      endFrame,
      endFrameAspectRatio,
      garmentAnchors,
      intermediateFrame,
      intermediateFrameAspectRatio,
      motionPreset,
      prompt,
      startFrameAspectRatio,
      workflowMode,
    ],
  );

  const loadGalleryImages = useCallback(async () => {
    if (!supabase) return;
    const assets = await loadDistinctImageGenerationAssets(supabase, { queryLimit: 180, maxResults: 90 });
    setGalleryImages(assets);
  }, [supabase]);

  const loadSimpleHistory = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("generations")
      .select("id,prompt,created_at,asset_url,url,video_meta,generation_kind")
      .eq("generation_kind", "video")
      .eq("video_meta->>source", "video-simple")
      .order("created_at", { ascending: false })
      .limit(8);

    setHistoryItems(((data ?? []) as PersistedSimpleVideoItem[]).filter((item) => Boolean(item.asset_url ?? item.url)));
  }, [supabase]);

  useEffect(() => {
    void loadGalleryImages();
    void loadSimpleHistory();
  }, [loadGalleryImages, loadSimpleHistory]);

  async function applyFrameSelection(item: GalleryImageItem) {
    const imageUrl = item.asset_url ?? item.url;
    if (!imageUrl || !pickerTarget) return;
    const target = pickerTarget;

    const selection: FrameAsset = {
      id: item.id,
      url: imageUrl,
      label: item.prompt || "Gallery image",
    };

    const aspect = await resolveImageAspectRatio(imageUrl);

    if (target.kind === "reference") {
      const referenceIndex = target.index;
      setReferenceImages((current) => {
        const next = [...current];
        next[referenceIndex] = selection;
        return next;
      });
    } else if (target.kind === "start") {
      setStartFrame(selection);
      setStartFrameAspectRatio(aspect);
    } else if (target.kind === "intermediate") {
      setIntermediateFrame(selection);
      setIntermediateFrameAspectRatio(aspect);
    } else {
      setEndFrame(selection);
      setEndFrameAspectRatio(aspect);
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

  function resolveShotFrames(shotType: VideoSimpleShotType) {
    if (workflowMode !== "two-shot-back-reveal") {
      return {
        firstFrameUrl: startFrame?.url ?? null,
        lastFrameUrl: endFrame?.url ?? null,
      };
    }

    if (shotType === "shot-a") {
      return {
        firstFrameUrl: startFrame?.url ?? null,
        lastFrameUrl: intermediateFrame?.url ?? null,
      };
    }

    return {
      firstFrameUrl: intermediateFrame?.url ?? null,
      lastFrameUrl: endFrame?.url ?? null,
    };
  }

  async function handleGeneratePrompt() {
    if (!prompt.trim() || isBuildingPrompt) return;

    try {
      setIsBuildingPrompt(true);
      setError(null);
      setPromptBuilderInlineError(null);

      const response = await fetch("/api/prompt-builder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectType: "video",
          workflowMode: workflowMode === "two-shot-back-reveal" ? "two_shot" : "single_shot",
          userIdea: prompt.trim(),
          environment: "simple-video",
          motionPreset,
          garmentAnchors,
          hasStartFrame: Boolean(startFrame),
          hasEndFrame: Boolean(endFrame),
          hasReferenceImages: activeReferenceImages.length > 0,
        }),
      });

      const payload = (await response.json()) as PromptBuilderResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "Failed to generate prompt.");
      }

      setPromptBuilderResult(payload.data);
      const nextPrompt = payload.data.videoPrompt.trim();
      if (!nextPrompt) {
        setPromptBuilderInlineError("Prompt Builder returned an empty video prompt. Please simplify your idea and try again.");
        return;
      }

      setPrompt(nextPrompt);
      if (payload.data.recommendedMode === "two_shot") {
        setWorkflowMode("two-shot-back-reveal");
      } else {
        setWorkflowMode("single-shot");
      }
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Failed to generate prompt.");
    } finally {
      setIsBuildingPrompt(false);
    }
  }

  async function generateShot(shotType: VideoSimpleShotType) {
    if (!prompt.trim()) {
      setError("Enter a prompt first.");
      return;
    }

    if (workflowMode === "two-shot-back-reveal") {
      if (!intermediateFrame) {
        setError("Two-shot mode requires an Intermediate Anchor frame.");
        return;
      }

      if (shotType === "shot-b" && !endFrame) {
        setError("Shot 2 requires an End frame.");
        return;
      }
    }

    const { firstFrameUrl, lastFrameUrl } = resolveShotFrames(shotType);
    const requestWorkflowMode = workflowMode;
    const requestGroupId = requestWorkflowMode === "two-shot-back-reveal" ? workflowGroupId : null;

    setIsGenerating(true);
    setActiveShot(shotType);
    setError(null);

    try {
      const response = await fetch("/api/studio/video/simple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          duration_seconds: duration,
          aspect_ratio: aspectRatio,
          first_frame_url: firstFrameUrl,
          last_frame_url: lastFrameUrl,
          motion_preset: motionPreset,
          workflow_mode: requestWorkflowMode,
          shot_type: requestWorkflowMode === "two-shot-back-reveal" ? shotType : "single",
          workflow_group_id: requestGroupId,
          reference_images: activeReferenceImages.map((item) => ({ url: item.url, role: item.role })),
          garment_anchors: garmentAnchors,
        }),
      });

      const payload = (await response.json()) as SimpleVideoResponse;
      if (!response.ok || !payload.success) {
        throw new Error(normalizeUploadLimitError(payload));
      }

      const generatedUrl = payload.data?.video_url ?? null;
      if (!generatedUrl) {
        throw new Error("Video generation succeeded but no video URL was returned.");
      }

      const nextOutput: OutputItem = {
        generationId: payload.data?.generation_id ?? `${Date.now()}`,
        videoUrl: generatedUrl,
        createdAt: new Date().toISOString(),
        model: payload.data?.model ?? "unknown",
        duration: payload.data?.duration_seconds ?? duration,
        aspectRatio: payload.data?.aspect_ratio ?? aspectRatio,
        compiledPrompt: payload.data?.compiled_prompt ?? prompt.trim(),
        controls: payload.data?.controls,
      };
      setOutputs((current) => [nextOutput, ...current]);
      setCopyStatus("idle");
      revealResults("latest-output");
      if (requestWorkflowMode === "two-shot-back-reveal" && shotType === "shot-b") {
        setWorkflowGroupId(createWorkflowGroupId());
      }
      await loadSimpleHistory();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Failed to generate video.");
    } finally {
      setIsGenerating(false);
      setActiveShot(null);
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
    if (!latestOutput?.videoUrl) return;
    try {
      await navigator.clipboard.writeText(latestOutput.videoUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  async function handleDownloadVideo() {
    if (!latestOutput?.videoUrl) return;
    setIsDownloading(true);
    const filename = buildDownloadFilename(latestOutput.videoUrl);
    try {
      const isSameOrigin = new URL(latestOutput.videoUrl, window.location.href).origin === window.location.origin;
      if (isSameOrigin) {
        const link = document.createElement("a");
        link.href = latestOutput.videoUrl;
        link.download = filename;
        link.rel = "noreferrer";
        document.body.append(link);
        link.click();
        link.remove();
        return;
      }

      const response = await fetch(latestOutput.videoUrl);
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
      link.href = latestOutput.videoUrl;
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

  async function handleDeleteHistoryItem(item: PersistedSimpleVideoItem) {
    if (isDeletingHistoryId) return;

    try {
      setIsDeletingHistoryId(item.id);
      const response = await fetch(`/api/generations/${item.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to delete generated video.");
      }
      setHistoryItems((current) => current.filter((entry) => entry.id !== item.id));
      setOutputs((current) => current.filter((entry) => entry.generationId !== item.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete generated video.");
    } finally {
      setIsDeletingHistoryId(null);
      setPendingHistoryDelete(null);
    }
  }

  const pickerTargetLabel =
    pickerTarget?.kind === "reference"
      ? REFERENCE_SLOTS[pickerTarget.index].label
      : pickerTarget?.kind === "start"
        ? "a start frame"
        : pickerTarget?.kind === "intermediate"
          ? "an intermediate anchor"
          : pickerTarget?.kind === "end"
            ? "an end frame"
            : "an image";

  const isTwoShot = workflowMode === "two-shot-back-reveal";
  const missingIntermediate = isTwoShot && !intermediateFrame;
  const missingEndFrame = isTwoShot && !endFrame;
  const anchorsFilled = Object.values(garmentAnchors).filter((value) => value.trim().length > 0).length;
  const referenceCount = activeReferenceImages.length;

  /** Frame slots for the current mode. Two-shot adds the required midpoint. */
  const frameSlots = [
    {
      key: "start" as const,
      label: "Start frame",
      hint: "The first frame of the clip. Usually your master front view.",
      value: startFrame,
      required: false,
      missing: false,
    },
    ...(isTwoShot
      ? [
          {
            key: "intermediate" as const,
            label: "Intermediate anchor",
            hint: "A 3/4 rear view. Splits the hard front-to-back turn in two.",
            value: intermediateFrame,
            required: true,
            missing: missingIntermediate,
          },
        ]
      : []),
    {
      key: "end" as const,
      label: "End frame",
      hint: isTwoShot ? "The final back view. Required for Shot 2." : "Where the clip lands. Leave empty to let motion decide.",
      value: endFrame,
      required: isTwoShot,
      missing: missingEndFrame,
    },
  ];

  function clearFrame(key: "start" | "intermediate" | "end") {
    if (key === "start") {
      setStartFrame(null);
      setStartFrameAspectRatio(null);
    } else if (key === "intermediate") {
      setIntermediateFrame(null);
      setIntermediateFrameAspectRatio(null);
    } else {
      setEndFrame(null);
      setEndFrameAspectRatio(null);
    }
  }

  return (
    <PageShell
      accent="cyan"
      eyebrow="Studio Project"
      title="Video Project"
      description="Turn your studio images into short clips. Use two-shot mode when a full front-to-back turn drifts."
      headerAction={
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong px-3.5 text-sm font-medium text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
          Image Project
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
      rail={
        <div className="space-y-4">
          {/* Step 1 — mode first, because it decides which frames are required. */}
          <Card className="space-y-3 p-4">
            <SectionHeading
              step={1}
              title="Workflow"
              description={
                isTwoShot
                  ? "Generate two safer clips through a midpoint anchor, then join them."
                  : "One clip, start to finish. Best for simple motion."
              }
            />
            <SegmentedControl
              label="Workflow mode"
              value={workflowMode}
              columns={1}
              onChange={(next) => setWorkflowMode(next)}
              options={[
                {
                  value: "single-shot",
                  label: "Single shot",
                  description: "One continuous clip.",
                },
                {
                  value: "two-shot-back-reveal",
                  label: "Two-shot back reveal",
                  description: "For difficult front-to-back turns.",
                },
              ]}
            />

            {isTwoShot ? (
              <Well className="space-y-2 p-3">
                {SHOT_DESCRIPTORS.map((shot) => (
                  <div key={shot.shotType} className="flex gap-2.5">
                    <Badge tone="accent">{shot.label}</Badge>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-2">{shot.flowLabel}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{shot.helper}</p>
                    </div>
                  </div>
                ))}
              </Well>
            ) : null}
          </Card>

          {/* Step 2 — prompt. */}
          <Card className="space-y-3 p-4">
            <SectionHeading step={2} title="Prompt" />

            <TextAreaField
              label="Describe the motion"
              hint="Subject behaviour, camera movement and pacing — not just the scene."
              value={prompt}
              maxLength={2000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Model turns slowly from front to profile, camera holds steady, soft daylight…"
            />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleGeneratePrompt()}
                loading={isBuildingPrompt}
                disabled={!prompt.trim()}
                iconLeft={<Wand2 className="h-3.5 w-3.5" />}
              >
                Refine with Prompt Builder
              </Button>
              {promptBuilderResult ? (
                <Badge
                  tone={
                    promptBuilderResult.riskLevel === "high"
                      ? "danger"
                      : promptBuilderResult.riskLevel === "medium"
                        ? "warning"
                        : "success"
                  }
                >
                  {promptBuilderResult.riskLevel} risk
                </Badge>
              ) : null}
            </div>

            {promptBuilderInlineError ? (
              <Alert tone="warning" onDismiss={() => setPromptBuilderInlineError(null)}>
                {promptBuilderInlineError}
              </Alert>
            ) : null}

            {promptBuilderResult?.negativeConstraints?.length ? (
              <Well className="p-3">
                <p className="text-xs font-medium text-ink-2">Negative constraints</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                  {promptBuilderResult.negativeConstraints.join(" · ")}
                </p>
              </Well>
            ) : null}

            {promptBuilderResult?.shotNotes?.length ? (
              <Well className="p-3">
                <p className="text-xs font-medium text-ink-2">Shot notes</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                  {promptBuilderResult.shotNotes.join(" · ")}
                </p>
              </Well>
            ) : null}
          </Card>

          {/* Step 3 — frames. Required slots now say so before you hit Generate. */}
          <Card className="space-y-3 p-4">
            <SectionHeading
              step={3}
              title="Frames"
              description="Pulled from your Image Project gallery."
            />
            <div className="grid grid-cols-2 gap-3">
              {frameSlots.map((slot) => (
                <AssetSlot
                  key={slot.key}
                  label={slot.label}
                  hint={slot.hint}
                  url={slot.value?.url}
                  required={slot.required}
                  missing={slot.missing}
                  onPick={() => setPickerTarget({ kind: slot.key })}
                  onClear={slot.value ? () => clearFrame(slot.key) : undefined}
                />
              ))}
            </div>
          </Card>

          {/* Step 4 — references. */}
          <Card className="space-y-3 p-4">
            <SectionHeading
              step={4}
              title="Reference images"
              description="Up to three, to hold garment detail through the turn."
              action={referenceCount ? <Badge tone="accent">{referenceCount}</Badge> : null}
            />

            <div className="grid grid-cols-3 gap-3">
              {REFERENCE_SLOTS.map((slot, index) => {
                const value = referenceImages[index];
                const neighbours = REFERENCE_SLOTS.map((other, otherIndex) => ({ other, otherIndex })).filter(
                  (entry) => entry.otherIndex !== index && Math.abs(entry.otherIndex - index) === 1,
                );

                return (
                  <div key={slot.role} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">{slot.label}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{slot.hint}</p>
                      </div>
                      {value ? (
                        <ActionMenu
                          label={`${slot.label} options`}
                          items={[
                            // "Move left/right" said nothing about what it did.
                            // These slots are roles, so the real action is
                            // reassigning the image to another role.
                            ...neighbours.map((entry) => ({
                              key: `swap-${entry.otherIndex}`,
                              label: `Swap with ${entry.other.label}`,
                              icon: <ArrowLeftRight className="h-3.5 w-3.5" />,
                              onSelect: () =>
                                moveReferenceImage(index, entry.otherIndex > index ? 1 : -1),
                            })),
                            {
                              key: "remove",
                              label: "Remove image",
                              icon: <X className="h-3.5 w-3.5" />,
                              destructive: true,
                              onSelect: () =>
                                setReferenceImages((current) => {
                                  const next = [...current];
                                  next[index] = null;
                                  return next;
                                }),
                            },
                          ]}
                        />
                      ) : null}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-line">
                      {value ? (
                        <button
                          type="button"
                          onClick={() => setPickerTarget({ kind: "reference", index })}
                          className="block w-full"
                          aria-label={`Replace ${slot.label}`}
                        >
                          <MediaFrame src={value.url} alt={slot.label} ratio="square" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPickerTarget({ kind: "reference", index })}
                          className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 bg-well text-ink-3 transition-colors hover:bg-raised hover:text-ink-2"
                        >
                          <ImagePlus className="h-5 w-5" aria-hidden />
                          <span className="text-[11px] font-medium">Choose</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Step 5 — output settings. */}
          <Card className="space-y-3 p-4">
            <SectionHeading step={5} title="Output" />

            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Duration"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value) as VideoDuration)}
              >
                <option value={4}>4 seconds</option>
                <option value={6}>6 seconds</option>
                <option value={8}>8 seconds</option>
              </SelectField>

              <SelectField
                label="Aspect ratio"
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value as VideoAspectRatio)}
              >
                <option value="9:16">9:16 — vertical (Reels, TikTok)</option>
                <option value="16:9">16:9 — landscape</option>
              </SelectField>
            </div>

            <SelectField
              label="Motion preset"
              hint={
                isTwoShot
                  ? "Two-shot mode already biases prompts toward slower, partial transitions."
                  : "Presets bias the prompt toward a known-safe camera and subject move."
              }
              value={motionPreset}
              onChange={(event) => setMotionPreset(event.target.value as VideoSimpleMotionPreset)}
            >
              {VIDEO_SIMPLE_MOTION_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {MOTION_PRESET_LABELS[preset]}
                </option>
              ))}
            </SelectField>
          </Card>

          {/* Advanced, collapsed by default — most runs never touch it. */}
          <Card className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 text-sm font-medium text-ink">
                <span className="flex items-center gap-2">
                  Garment anchors
                  {anchorsFilled ? <Badge tone="accent">{anchorsFilled}</Badge> : null}
                </span>
                <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
              </summary>

              <div className="space-y-3 border-t border-line p-4">
                <p className="text-xs leading-relaxed text-ink-3">
                  Name only the details that must survive the turn. Keep each field to a few words.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {GARMENT_ANCHOR_FIELDS.map((field) => (
                    <TextField
                      key={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      value={garmentAnchors[field.key]}
                      onChange={(event) => updateGarmentAnchor(field.key, event.target.value)}
                    />
                  ))}
                </div>
              </div>
            </details>
          </Card>

          {preflightWarnings.length ? (
            <Alert tone="warning" title="Before you generate">
              <ul className="list-disc space-y-1 pl-4">
                {preflightWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {error ? (
            <Alert tone="danger" title="Generation failed" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          ) : null}

          <div className="-mx-1 space-y-2 px-1 pb-1 pt-1 xl:sticky xl:bottom-0 xl:bg-gradient-to-t xl:from-canvas xl:from-75% xl:to-transparent xl:pb-2 xl:pt-8">
            {isTwoShot ? (
              <div className="grid gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  block
                  onClick={() => void generateShot("shot-a")}
                  loading={isGenerating && activeShot === "shot-a"}
                  disabled={isGenerating || !prompt.trim() || missingIntermediate}
                  iconLeft={<Clapperboard className="h-4 w-4" />}
                >
                  Generate Shot 1 · Front → Mid
                </Button>
                <Button
                  size="lg"
                  block
                  onClick={() => void generateShot("shot-b")}
                  loading={isGenerating && activeShot === "shot-b"}
                  disabled={isGenerating || !prompt.trim() || missingIntermediate || missingEndFrame}
                  iconLeft={<Clapperboard className="h-4 w-4" />}
                >
                  Generate Shot 2 · Mid → Back
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                block
                onClick={() => void generateShot("single")}
                loading={isGenerating}
                disabled={!prompt.trim()}
                iconLeft={<Clapperboard className="h-4 w-4" />}
              >
                Generate clip
              </Button>
            )}

            {!prompt.trim() ? (
              <p className="text-center text-[11px] text-ink-3">Write a prompt to enable generation.</p>
            ) : missingIntermediate ? (
              <p className="text-center text-[11px] text-warning">Two-shot mode needs an intermediate anchor frame.</p>
            ) : null}
          </div>
        </div>
      }
    >
      {/* The result is the point of the page, so on narrow screens it sits
          above the controls rather than below a 40-field form. */}
      <section aria-labelledby="latest-output" className="space-y-3">
        <h2 id="latest-output" className="text-lg font-semibold tracking-tight text-ink">
          Latest clip
        </h2>

        {isGenerating ? (
          <GeneratingPanel
            title={
              activeShot === "shot-a"
                ? "Rendering Shot 1…"
                : activeShot === "shot-b"
                  ? "Rendering Shot 2…"
                  : "Rendering your clip…"
            }
            typicalSeconds={90}
          />
        ) : latestOutput ? (
          <Card className="overflow-hidden">
            <video
              className="w-full bg-black"
              src={latestOutput.videoUrl}
              controls
              playsInline
              preload="metadata"
            />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{latestOutput.duration}s</Badge>
                <Badge>{latestOutput.aspectRatio}</Badge>
                {latestOutput.controls ? (
                  <>
                    <Badge>{MOTION_PRESET_LABELS[latestOutput.controls.motion_preset ?? "freeform"]}</Badge>
                    <Badge>
                      {latestOutput.controls.reference_count ?? 0} reference
                      {(latestOutput.controls.reference_count ?? 0) === 1 ? "" : "s"}
                    </Badge>
                    {latestOutput.controls.shot_type === "shot-a" ? <Badge tone="accent">Shot 1</Badge> : null}
                    {latestOutput.controls.shot_type === "shot-b" ? <Badge tone="accent">Shot 2</Badge> : null}
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleDownloadVideo()}
                  loading={isDownloading}
                  iconLeft={<Download className="h-3.5 w-3.5" />}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleCopyVideoUrl()}
                  iconLeft={
                    copyStatus === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
                  }
                >
                  {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy link"}
                </Button>
                <a
                  href={latestOutput.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Open
                </a>
              </div>

              <p className="font-mono text-[11px] text-ink-3">{latestOutput.model}</p>

              {latestOutput.compiledPrompt ? (
                <details className="group rounded-xl border border-line bg-well">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs text-ink-2">
                    Compiled request prompt
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-ink-3">
                    {latestOutput.compiledPrompt}
                  </p>
                </details>
              ) : null}
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title="No clip yet"
            description="Pick a start frame, describe the motion, then generate. Rendering usually takes around a minute."
          />
        )}
      </section>

      <section aria-labelledby="history" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="history" className="text-lg font-semibold tracking-tight text-ink">
            Recent clips
          </h2>
          <Button size="sm" variant="ghost" onClick={() => void loadSimpleHistory()} iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>

        {historyItems.length ? (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {historyItems.map((item) => {
              const videoUrl = item.asset_url ?? item.url;
              if (!videoUrl) return null;
              const videoMeta = item.video_meta ?? {};
              const workflow = readMetaString(videoMeta, "workflowMode");
              const shot = readMetaString(videoMeta, "shotType");
              const savedAspectRatio = asValidAspectRatio(readMetaString(videoMeta, "aspectRatio") || "9:16");
              const savedDuration = readMetaNumber(videoMeta, "durationSeconds", 6);

              return (
                <Card key={item.id} className="overflow-hidden">
                  <video
                    className="w-full bg-black"
                    src={videoUrl}
                    controls
                    preload="metadata"
                    playsInline
                  />
                  <div className="space-y-2.5 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{workflow === "two-shot-back-reveal" ? "Two-shot" : "Single"}</Badge>
                      {shot === "shot-a" ? <Badge tone="accent">Shot 1</Badge> : null}
                      {shot === "shot-b" ? <Badge tone="accent">Shot 2</Badge> : null}
                      <Badge>{savedDuration}s</Badge>
                      <Badge>{savedAspectRatio}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <DownloadAssetButton
                        url={videoUrl}
                        filenamePrefix={`simple-video-${item.id}`}
                        label="Save"
                        mimeType="video/mp4"
                      />
                      <ActionMenu
                        label="Clip actions"
                        items={[
                          {
                            key: "delete",
                            label: "Delete clip",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            destructive: true,
                            onSelect: () => setPendingHistoryDelete(item),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Film className="h-6 w-6" />}
            title="No saved clips yet"
            description="Every clip you generate is stored here so you can compare takes side by side."
          />
        )}
      </section>

      <Modal
        open={Boolean(pickerTarget)}
        onClose={() => setPickerTarget(null)}
        title={`Choose ${pickerTargetLabel}`}
        description="Images from your Image Project gallery."
        size="xl"
        footer={
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => void loadGalleryImages()} iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>
              Refresh gallery
            </Button>
            <Button size="sm" onClick={() => setPickerTarget(null)}>
              Cancel
            </Button>
          </div>
        }
      >
        {galleryImages.length ? (
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {galleryImages.map((item) => {
              const imageUrl = item.asset_url ?? item.url;
              if (!imageUrl) return null;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void applyFrameSelection(item)}
                    className="group block w-full overflow-hidden rounded-xl border border-line text-left transition-colors hover:border-accent"
                  >
                    <MediaFrame src={imageUrl} alt={item.prompt || "Gallery image"} ratio="square" />
                    <p className="line-clamp-2 px-2 py-1.5 text-[11px] leading-snug text-ink-3 transition-colors group-hover:text-ink-2">
                      {item.prompt || "Gallery image"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<ImageIcon className="h-6 w-6" />}
            title="No gallery images"
            description="Generate images in the Image Project first — they show up here as frame candidates."
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingHistoryDelete)}
        title="Delete this clip?"
        description="The video file and its generation record are removed permanently. This cannot be undone."
        confirmLabel="Delete clip"
        busy={Boolean(pendingHistoryDelete && isDeletingHistoryId === pendingHistoryDelete.id)}
        onCancel={() => setPendingHistoryDelete(null)}
        onConfirm={() => {
          if (pendingHistoryDelete) void handleDeleteHistoryItem(pendingHistoryDelete);
        }}
      />
    </PageShell>
  );
}
