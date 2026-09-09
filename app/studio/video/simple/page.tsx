"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Film,
  ImageIcon,
  Library,
  RefreshCw,
  Scissors,
  SkipForward,
  ShieldCheck,
  Trash2,
  Wand2,
} from "lucide-react";
import ActionMenu from "@/components/ui/ActionMenu";
import Alert from "@/components/ui/Alert";
import AssetSlot from "@/components/ui/AssetSlot";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DownloadButton from "@/components/ui/DownloadButton";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import GeneratingPanel from "@/components/ui/GeneratingPanel";
import MediaFrame from "@/components/ui/MediaFrame";
import Modal from "@/components/ui/Modal";
import PageShell from "@/components/ui/PageShell";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Badge, Card, EmptyState, SectionHeading, Well } from "@/components/ui/Surface";
import { revealResults } from "@/components/ui/revealResults";
import {
  GARMENT_ROLE_LABELS,
  isGarmentViewRole,
  type GarmentViewRole,
  type ResolvedGarmentView,
} from "@/lib/garment/roles";
import { loadDistinctImageGenerationAssets, type ImageGenerationAsset } from "@/lib/studio/imageGenerationAssets";
import { describeExtractionFailure, extractLastFrame } from "@/lib/video/extractLastFrame";
import { assessFidelity, planConditioning, type ConditioningImage } from "@/lib/video/veo/conditioning";
import {
  createEmptyGarmentAnchors,
  detectsTurnIntent,
  GARMENT_ANCHOR_FIELDS,
  MOTION_PRESET_HINTS,
  MOTION_PRESET_LABELS,
  MOTION_PRESETS,
  type GarmentAnchors,
  type MotionPreset,
} from "@/lib/video/veo/prompt";

type AspectRatio = "16:9" | "9:16";
type Duration = 4 | 6 | 8;

type FrameAsset = ConditioningImage & { id?: string };

type GenerateResponse = {
  success?: boolean;
  error?: string;
  error_code?: string;
  max_mb?: number;
  data?: {
    generation_id?: string;
    video_url?: string;
    model?: string;
    duration_seconds?: number;
    aspect_ratio?: AspectRatio;
    compiled_prompt?: string;
    conditioning?: { mode?: string; rationale?: string };
    fidelity?: { risk?: "low" | "medium" | "high" };
    controls?: { shot_label?: string | null };
  };
};

type PromptBuilderResponse = {
  success?: boolean;
  error?: string;
  data?: { videoPrompt: string };
};

type OutputItem = {
  generationId: string;
  videoUrl: string;
  model: string;
  duration: number;
  aspectRatio: AspectRatio;
  compiledPrompt: string;
  conditioningMode: string;
  conditioningRationale: string;
  risk: "low" | "medium" | "high";
  shotLabel: string | null;
};

type HistoryItem = {
  id: string;
  prompt: string;
  created_at?: string | null;
  asset_url?: string | null;
  url?: string | null;
  video_meta?: Record<string, unknown> | null;
};

/** Each member carries a single literal `kind` so the discriminant narrows. */
type PickerTarget =
  | { kind: "start" }
  | { kind: "end" }
  | { kind: "reference"; index: number };

const REFERENCE_SLOT_COUNT = 3;

/** How each conditioning mode is described to a seller. */
const MODE_LABELS: Record<string, string> = {
  interpolate: "Both ends pinned",
  "first-frame": "Opening frame pinned",
  references: "Reference images",
  text: "Prompt only",
};

function modeLabel(mode: string) {
  return MODE_LABELS[mode] ?? mode.replace(/-/g, " ");
}

/** Orientations a seller can label a frame with. */
const FRAME_ROLE_OPTIONS: GarmentViewRole[] = [
  "front",
  "three_quarter_left",
  "left_profile",
  "back",
  "right_profile",
  "three_quarter_right",
];

function readMeta(meta: Record<string, unknown> | null | undefined, key: string) {
  const value = meta?.[key];
  return typeof value === "string" ? value : "";
}

function readMetaNumber(meta: Record<string, unknown> | null | undefined, key: string, fallback: number) {
  const value = meta?.[key];
  return typeof value === "number" ? value : fallback;
}

function asAspectRatio(value: string): AspectRatio {
  return value === "16:9" ? "16:9" : "9:16";
}

function createShotGroupId() {
  return `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VideoProjectPage() {
  const [prompt, setPrompt] = useState("");
  const [garmentDescription, setGarmentDescription] = useState("");
  const [preset, setPreset] = useState<MotionPreset>("product-turn");
  const [duration, setDuration] = useState<Duration>(6);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");

  const [startFrame, setStartFrame] = useState<FrameAsset | null>(null);
  const [endFrame, setEndFrame] = useState<FrameAsset | null>(null);
  const [references, setReferences] = useState<Array<FrameAsset | null>>(
    Array.from({ length: REFERENCE_SLOT_COUNT }, () => null),
  );
  const [anchors, setAnchors] = useState<GarmentAnchors>(() => createEmptyGarmentAnchors());

  const [skuCode, setSkuCode] = useState("");
  const [garmentViews, setGarmentViews] = useState<ResolvedGarmentView[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [galleryImages, setGalleryImages] = useState<ImageGenerationAsset[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeShotLabel, setActiveShotLabel] = useState<string | null>(null);
  const [isBuildingPrompt, setIsBuildingPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const latestOutput = outputs[0] ?? null;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeletingHistoryId, setIsDeletingHistoryId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HistoryItem | null>(null);
  const [continuingFromId, setContinuingFromId] = useState<string | null>(null);

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const activeReferences = useMemo(() => references.filter((item): item is FrameAsset => Boolean(item)), [references]);

  /**
   * The same planner the server runs, so the page can show which conditioning
   * shape a request will use — and what the model will have to invent — before
   * the seller spends a generation finding out.
   */
  const plan = useMemo(
    () => planConditioning({ startFrame, endFrame, references: activeReferences }),
    [startFrame, endFrame, activeReferences],
  );

  const turnIntent = useMemo(() => detectsTurnIntent(prompt, preset), [prompt, preset]);
  const fidelity = useMemo(() => assessFidelity(plan, { turnIntent }), [plan, turnIntent]);

  const loadGalleryImages = useCallback(async () => {
    if (!supabase) return;
    setGalleryImages(await loadDistinctImageGenerationAssets(supabase, { queryLimit: 180, maxResults: 90 }));
  }, [supabase]);

  const loadHistory = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("generations")
      .select("id,prompt,created_at,asset_url,url,video_meta,generation_kind")
      .eq("generation_kind", "video")
      .eq("video_meta->>source", "video-simple")
      .order("created_at", { ascending: false })
      .limit(9);

    setHistoryItems(((data ?? []) as HistoryItem[]).filter((item) => Boolean(item.asset_url ?? item.url)));
  }, [supabase]);

  useEffect(() => {
    void loadGalleryImages();
    void loadHistory();
  }, [loadGalleryImages, loadHistory]);

  async function loadGarmentLibrary() {
    const code = skuCode.trim();
    if (!code || isLoadingLibrary) return;

    setIsLoadingLibrary(true);
    setError(null);
    setLibraryNotice(null);

    try {
      const response = await fetch(`/api/garment-library?sku_code=${encodeURIComponent(code)}`);
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { views?: ResolvedGarmentView[] };
      };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "Could not load the garment library.");

      const views = payload.data?.views ?? [];
      setGarmentViews(views);

      if (!views.length) {
        setLibraryNotice(
          `No saved views for ${code.toUpperCase()} yet. Generate the front and back in the Image Project, then save each one to this SKU.`,
        );
        return;
      }

      // Auto-fill the strongest available setup: a real front and a real back
      // pin both ends of a turn, which is the whole point of the library.
      const byRole = new Map(views.map((view) => [view.role, view]));
      const front = byRole.get("front");
      const back = byRole.get("back");

      if (front) setStartFrame({ url: front.url, role: "front", id: front.generation_id });
      if (back) setEndFrame({ url: back.url, role: "back", id: back.generation_id });

      const remaining = views.filter((view) => view.role !== "front" && view.role !== "back");
      setReferences(
        Array.from({ length: REFERENCE_SLOT_COUNT }, (_, index) => {
          const view = remaining[index];
          return view ? { url: view.url, role: view.role, id: view.generation_id } : null;
        }),
      );

      setLibraryNotice(
        front && back
          ? `Loaded ${views.length} saved view${views.length === 1 ? "" : "s"}. Front and back are pinned as the clip's endpoints.`
          : back
            ? `Loaded ${views.length} saved view${views.length === 1 ? "" : "s"}. No front view saved yet.`
            : `Loaded ${views.length} saved view${views.length === 1 ? "" : "s"}. No back view saved yet — that is the one that stops the reverse being invented.`,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the garment library.");
    } finally {
      setIsLoadingLibrary(false);
    }
  }

  function applyPickedImage(item: ImageGenerationAsset) {
    const url = item.asset_url ?? item.url;
    if (!url || !pickerTarget) return;

    const asset: FrameAsset = { url, id: item.id, label: item.prompt || "Gallery image" };

    if (pickerTarget.kind === "start") {
      setStartFrame(asset);
    } else if (pickerTarget.kind === "end") {
      setEndFrame(asset);
    } else {
      const { index } = pickerTarget;
      setReferences((current) => {
        const next = [...current];
        next[index] = asset;
        return next;
      });
    }

    setPickerTarget(null);
  }

  function setFrameRole(which: "start" | "end", role: string) {
    const next = isGarmentViewRole(role) ? role : undefined;
    if (which === "start") setStartFrame((current) => (current ? { ...current, role: next } : current));
    else setEndFrame((current) => (current ? { ...current, role: next } : current));
  }

  async function handleGeneratePrompt() {
    if (!prompt.trim() || isBuildingPrompt) return;

    setIsBuildingPrompt(true);
    setError(null);
    try {
      const response = await fetch("/api/prompt-builder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectType: "video",
          workflowMode: null,
          userIdea: prompt.trim(),
          environment: "video-clip",
          motionPreset: preset,
          garmentAnchors: anchors,
          hasStartFrame: Boolean(startFrame),
          hasEndFrame: Boolean(endFrame),
          hasReferenceImages: activeReferences.length > 0,
        }),
      });
      const payload = (await response.json()) as PromptBuilderResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "Could not refine the prompt.");
      }
      const next = payload.data.videoPrompt.trim();
      if (next) setPrompt(next);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Could not refine the prompt.");
    } finally {
      setIsBuildingPrompt(false);
    }
  }

  async function generateClip(options?: {
    startOverride?: FrameAsset | null;
    endOverride?: FrameAsset | null;
    shotLabel?: string;
    shotGroupId?: string;
  }) {
    if (!prompt.trim()) {
      setError("Describe the motion before generating.");
      return;
    }

    setIsGenerating(true);
    setActiveShotLabel(options?.shotLabel ?? null);
    setError(null);

    try {
      const response = await fetch("/api/studio/video/simple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          garment_description: garmentDescription.trim() || undefined,
          duration_seconds: duration,
          aspect_ratio: aspectRatio,
          resolution,
          motion_preset: preset,
          garment_anchors: anchors,
          sku_code: skuCode.trim() || null,
          start_frame: options?.startOverride !== undefined ? options.startOverride : startFrame,
          end_frame: options?.endOverride !== undefined ? options.endOverride : endFrame,
          reference_images: activeReferences,
          shot_label: options?.shotLabel ?? null,
          shot_group_id: options?.shotGroupId ?? null,
        }),
      });

      const payload = (await response.json()) as GenerateResponse;
      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error_code === "upload-limit-exceeded" && typeof payload.max_mb === "number"
            ? `The clip is larger than the ${payload.max_mb.toFixed(0)} MB upload limit. Try a shorter duration or 720p.`
            : (payload.error ?? "Video generation failed."),
        );
      }

      const videoUrl = payload.data?.video_url;
      if (!videoUrl) throw new Error("Generation succeeded but no video URL came back.");

      setOutputs((current) => [
        {
          generationId: payload.data?.generation_id ?? `${Date.now()}`,
          videoUrl,
          model: payload.data?.model ?? "",
          duration: payload.data?.duration_seconds ?? duration,
          aspectRatio: payload.data?.aspect_ratio ?? aspectRatio,
          compiledPrompt: payload.data?.compiled_prompt ?? "",
          conditioningMode: payload.data?.conditioning?.mode ?? plan.mode,
          conditioningRationale: payload.data?.conditioning?.rationale ?? plan.rationale,
          risk: payload.data?.fidelity?.risk ?? fidelity.risk,
          shotLabel: payload.data?.controls?.shot_label ?? options?.shotLabel ?? null,
        },
        ...current,
      ]);
      setCopyStatus("idle");
      revealResults("latest-output");
      await loadHistory();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Video generation failed.");
    } finally {
      setIsGenerating(false);
      setActiveShotLabel(null);
    }
  }

  /**
   * A mid-rotation view, used to split a half-turn into two pinned clips.
   *
   * A 180° turn inside one 8-second clip is where garment detail drifts worst.
   * With a saved 3/4 or profile view the turn becomes two shorter clips that
   * each begin and end on a real image, so nothing beyond a quarter-turn is
   * ever invented.
   */
  const midTurnView = useMemo(
    () => garmentViews.find((view) => view.role === "three_quarter_left" || view.role === "left_profile") ?? null,
    [garmentViews],
  );

  const canSplitTurn =
    Boolean(startFrame && endFrame && midTurnView) &&
    fidelity.uncoveredDegrees !== null &&
    fidelity.uncoveredDegrees >= 135;

  async function generateSplitTurn() {
    if (!startFrame || !endFrame || !midTurnView) return;
    const groupId = createShotGroupId();
    const mid: FrameAsset = { url: midTurnView.url, role: midTurnView.role, id: midTurnView.generation_id };

    await generateClip({ endOverride: mid, shotLabel: "Shot 1 · front to mid", shotGroupId: groupId });
    await generateClip({ startOverride: mid, shotLabel: "Shot 2 · mid to back", shotGroupId: groupId });
  }

  /**
   * Chain a new clip onto the end of an existing one.
   *
   * Veo caps a single clip at 8 seconds, so a longer sequence has to be built
   * from several. Taking the real closing frame as the next clip's opening
   * frame means the join is pinned to an actual rendered image rather than to a
   * description of one, which is the same principle the whole conditioning
   * planner is built on.
   *
   * The old end frame is cleared deliberately: it described where the previous
   * clip finished, and keeping it would make the new clip loop back to a pose
   * it is starting from.
   */
  async function continueFromClip(input: { id: string; videoUrl: string; aspectRatio?: AspectRatio }) {
    if (continuingFromId) return;

    setContinuingFromId(input.id);
    setError(null);

    try {
      const frame = await extractLastFrame(input.videoUrl);

      const form = new FormData();
      form.append("file", new File([frame.blob], `continuation-${input.id}.png`, { type: "image/png" }));
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const payload = (await response.json()) as { success?: boolean; public_url?: string; error?: string };
      if (!response.ok || !payload.success || !payload.public_url) {
        throw new Error(payload.error ?? "The extracted frame could not be saved.");
      }

      setStartFrame({
        url: payload.public_url,
        label: "Closing frame of the previous clip",
      });
      setEndFrame(null);
      if (input.aspectRatio) setAspectRatio(input.aspectRatio);

      setLibraryNotice(
        "The previous clip's closing frame is now the opening frame. Add a closing frame to pin where this one lands.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (extractionError) {
      setError(describeExtractionFailure(extractionError));
    } finally {
      setContinuingFromId(null);
    }
  }

  async function handleDownloadVideo() {
    if (!latestOutput || isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(latestOutput.videoUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `megaska-clip-${latestOutput.generationId}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      setError("Downloading the clip failed. Try the Open link instead.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleCopyVideoUrl() {
    if (!latestOutput) return;
    try {
      await navigator.clipboard.writeText(latestOutput.videoUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    window.setTimeout(() => setCopyStatus("idle"), 2000);
  }

  async function handleDeleteHistoryItem(item: HistoryItem) {
    if (isDeletingHistoryId) return;
    setIsDeletingHistoryId(item.id);
    try {
      const response = await fetch(`/api/generations/${item.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "Could not delete this clip.");
      setHistoryItems((current) => current.filter((entry) => entry.id !== item.id));
      setOutputs((current) => current.filter((entry) => entry.generationId !== item.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this clip.");
    } finally {
      setIsDeletingHistoryId(null);
      setPendingDelete(null);
    }
  }

  const pickerLabel =
    pickerTarget?.kind === "start"
      ? "an opening frame"
      : pickerTarget?.kind === "end"
        ? "a closing frame"
        : "a reference image";

  const riskTone = fidelity.risk === "low" ? "success" : fidelity.risk === "medium" ? "warning" : "danger";
  const anchorsFilled = Object.values(anchors).filter((value) => value.trim().length > 0).length;
  const referencesUsable = plan.mode === "references";

  return (
    <PageShell
      accent="cyan"
      eyebrow="Studio Project"
      title="Video Project"
      description="Turn saved product views into clips. Pin both ends of a turn and the garment stays real all the way round."
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
          {/* Step 1 — the garment library. This is the fix for invented backs:
              save the real views once, and every later clip is conditioned on
              them instead of guessing. */}
          <Card className="space-y-3 p-4">
            <SectionHeading step={1} title="Garment" description="Load the verified views saved for this product." />
            <div className="flex items-end gap-2">
              <TextField
                label="SKU code"
                placeholder="MGSW05"
                className="flex-1"
                value={skuCode}
                onChange={(event) => setSkuCode(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadGarmentLibrary();
                }}
              />
              <Button
                onClick={() => void loadGarmentLibrary()}
                loading={isLoadingLibrary}
                disabled={!skuCode.trim()}
                iconLeft={<Library className="h-4 w-4" />}
              >
                Load
              </Button>
            </div>

            {garmentViews.length ? (
              <div className="flex flex-wrap gap-1.5">
                {garmentViews.map((view) => (
                  <Badge key={view.id} tone={view.role === "back" ? "success" : "neutral"}>
                    {GARMENT_ROLE_LABELS[view.role]}
                  </Badge>
                ))}
              </div>
            ) : null}

            {libraryNotice ? <Alert tone="info">{libraryNotice}</Alert> : null}

            <TextField
              label="Garment description"
              hint="Optional. A short product phrase helps the model name what it is holding constant."
              placeholder="Emerald ribbed one-piece swimsuit"
              value={garmentDescription}
              onChange={(event) => setGarmentDescription(event.target.value)}
            />
          </Card>

          {/* Step 2 — frames. */}
          <Card className="space-y-3 p-4">
            <SectionHeading
              step={2}
              title="Frames"
              description="Both ends pinned to real images is the strongest setup available."
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <AssetSlot
                  label="Opening frame"
                  url={startFrame?.url}
                  onPick={() => setPickerTarget({ kind: "start" })}
                  onClear={startFrame ? () => setStartFrame(null) : undefined}
                />
                {startFrame ? (
                  <SelectField
                    label="Shows"
                    value={startFrame.role ?? ""}
                    onChange={(event) => setFrameRole("start", event.target.value)}
                  >
                    <option value="">Not specified</option>
                    {FRAME_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {GARMENT_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </SelectField>
                ) : null}
              </div>

              <div className="space-y-2">
                <AssetSlot
                  label="Closing frame"
                  url={endFrame?.url}
                  required={turnIntent}
                  missing={turnIntent && !endFrame}
                  onPick={() => setPickerTarget({ kind: "end" })}
                  onClear={endFrame ? () => setEndFrame(null) : undefined}
                />
                {endFrame ? (
                  <SelectField
                    label="Shows"
                    value={endFrame.role ?? ""}
                    onChange={(event) => setFrameRole("end", event.target.value)}
                  >
                    <option value="">Not specified</option>
                    {FRAME_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {GARMENT_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </SelectField>
                ) : null}
              </div>
            </div>
          </Card>

          {/* Step 3 — references, with the provider's exclusivity rule stated
              rather than hidden. */}
          <Card className="space-y-3 p-4">
            <SectionHeading
              step={3}
              title="Reference images"
              description="Used only when the clip is not pinned to a frame pair."
              action={
                activeReferences.length ? (
                  <Badge tone={referencesUsable ? "accent" : "neutral"}>{activeReferences.length}</Badge>
                ) : null
              }
            />

            {!referencesUsable && activeReferences.length ? (
              <Alert tone="info">
                The provider does not accept reference images alongside opening and closing frames, so these are not
                being sent. Pinned frames are the stronger signal — clear one to switch to references.
              </Alert>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              {references.map((reference, index) => (
                <div key={index} className={referencesUsable || !activeReferences.length ? undefined : "opacity-45"}>
                  <AssetSlot
                    label={`Ref ${index + 1}`}
                    hideStatus
                    url={reference?.url}
                    onPick={() => setPickerTarget({ kind: "reference", index })}
                    onClear={
                      reference
                        ? () =>
                            setReferences((current) => {
                              const next = [...current];
                              next[index] = null;
                              return next;
                            })
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Step 4 — motion and prompt. */}
          <Card className="space-y-3 p-4">
            <SectionHeading step={4} title="Motion" />

            <SegmentedControl
              label="Motion preset"
              value={preset}
              columns={2}
              onChange={setPreset}
              options={MOTION_PRESETS.map((value) => ({
                value,
                label: MOTION_PRESET_LABELS[value],
                description: MOTION_PRESET_HINTS[value],
              }))}
            />

            <TextAreaField
              label="Describe the motion"
              hint="Subject behaviour, camera movement and pacing."
              value={prompt}
              maxLength={2000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Model turns steadily from front to back, camera holds still, soft daylight…"
            />

            <Button
              size="sm"
              onClick={() => void handleGeneratePrompt()}
              loading={isBuildingPrompt}
              disabled={!prompt.trim()}
              iconLeft={<Wand2 className="h-3.5 w-3.5" />}
            >
              Refine with Prompt Builder
            </Button>
          </Card>

          {/* Step 5 — output. */}
          <Card className="space-y-3 p-4">
            <SectionHeading step={5} title="Output" />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Duration"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value) as Duration)}
              >
                <option value={4}>4 seconds</option>
                <option value={6}>6 seconds</option>
                <option value={8}>8 seconds</option>
              </SelectField>
              <SelectField
                label="Aspect ratio"
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value as AspectRatio)}
              >
                <option value="9:16">9:16 — vertical</option>
                <option value="16:9">16:9 — landscape</option>
              </SelectField>
            </div>
            <SelectField
              label="Resolution"
              hint="1080p is sharper but much larger to store."
              value={resolution}
              onChange={(event) => setResolution(event.target.value as "720p" | "1080p")}
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </SelectField>
          </Card>

          <Card className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 text-sm font-medium text-ink">
                <span className="flex items-center gap-2">
                  Garment details
                  {anchorsFilled ? <Badge tone="accent">{anchorsFilled}</Badge> : null}
                </span>
                <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                <p className="text-xs leading-relaxed text-ink-3">
                  Name only what must survive the turn. The reference imagery does most of the work; a few words help
                  where a detail is hard to see.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {GARMENT_ANCHOR_FIELDS.map((field) => (
                    <TextField
                      key={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      value={anchors[field.key]}
                      onChange={(event) => setAnchors((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  ))}
                </div>
              </div>
            </details>
          </Card>

          {error ? (
            <Alert tone="danger" title="Generation failed" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          ) : null}

          <div className="-mx-1 space-y-2 px-1 pb-1 pt-1 xl:sticky xl:bottom-0 xl:bg-gradient-to-t xl:from-canvas xl:from-75% xl:to-transparent xl:pb-2 xl:pt-8">
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => void generateClip()}
              loading={isGenerating && !activeShotLabel}
              disabled={isGenerating || !prompt.trim()}
              iconLeft={<Clapperboard className="h-4 w-4" />}
            >
              Generate clip
            </Button>

            {canSplitTurn ? (
              <Button
                block
                onClick={() => void generateSplitTurn()}
                loading={isGenerating && Boolean(activeShotLabel)}
                disabled={isGenerating || !prompt.trim()}
                iconLeft={<Scissors className="h-4 w-4" />}
              >
                Split into two pinned clips
              </Button>
            ) : null}

            {!prompt.trim() ? (
              <p className="text-center text-[11px] text-ink-3">Describe the motion to enable generation.</p>
            ) : null}
          </div>
        </div>
      }
    >
      {/* The fidelity readout leads the canvas: "will the back of my product be
          real" is the question this app exists to get right, so it is answered
          before the clip is spent, not after. */}
      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
              riskTone === "success"
                ? "border-success/40 bg-success/10 text-success"
                : riskTone === "warning"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-danger/40 bg-danger/10 text-danger"
            }`}
            aria-hidden
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Garment fidelity</h2>
              <Badge tone={riskTone}>{fidelity.risk} risk</Badge>
              <Badge>{modeLabel(plan.mode)}</Badge>
              {fidelity.uncoveredDegrees !== null ? <Badge>{fidelity.uncoveredDegrees}° turn</Badge> : null}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{plan.rationale}</p>
          </div>
        </div>

        {fidelity.findings.length ? (
          <ul className="space-y-1 text-xs leading-relaxed text-ink-2">
            {fidelity.findings.map((finding) => (
              <li key={finding} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                {finding}
              </li>
            ))}
          </ul>
        ) : null}

        {fidelity.nextBestAction ? (
          <Well className="flex flex-wrap items-center justify-between gap-2 p-3">
            <p className="min-w-0 text-xs text-ink-2">
              <span className="font-medium text-ink">Next best step: </span>
              {fidelity.nextBestAction}
            </p>
            {canSplitTurn ? (
              <Button size="sm" onClick={() => void generateSplitTurn()} disabled={isGenerating}>
                Split the turn
              </Button>
            ) : null}
          </Well>
        ) : null}

        {plan.dropped.length ? (
          <Alert tone="warning" title="Not sent to the provider">
            <ul className="space-y-1">
              {plan.dropped.map((entry) => (
                <li key={entry.image.url}>{entry.reason}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </Card>

      <section aria-labelledby="latest-output" className="space-y-3">
        <h2 id="latest-output" className="text-lg font-semibold tracking-tight text-ink">
          Latest clip
        </h2>

        {isGenerating ? (
          <GeneratingPanel
            title={activeShotLabel ? `Rendering ${activeShotLabel}…` : "Rendering your clip…"}
            typicalSeconds={90}
          />
        ) : latestOutput ? (
          <Card className="overflow-hidden">
            <video className="w-full bg-black" src={latestOutput.videoUrl} controls playsInline preload="metadata" />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                {latestOutput.shotLabel ? <Badge tone="accent">{latestOutput.shotLabel}</Badge> : null}
                <Badge>{latestOutput.duration}s</Badge>
                <Badge>{latestOutput.aspectRatio}</Badge>
                <Badge>{modeLabel(latestOutput.conditioningMode)}</Badge>
                <Badge
                  tone={latestOutput.risk === "low" ? "success" : latestOutput.risk === "medium" ? "warning" : "danger"}
                >
                  {latestOutput.risk} risk
                </Badge>
              </div>

              <p className="text-xs leading-relaxed text-ink-3">{latestOutput.conditioningRationale}</p>

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
                <Button
                  size="sm"
                  onClick={() =>
                    void continueFromClip({
                      id: latestOutput.generationId,
                      videoUrl: latestOutput.videoUrl,
                      aspectRatio: latestOutput.aspectRatio,
                    })
                  }
                  loading={continuingFromId === latestOutput.generationId}
                  disabled={Boolean(continuingFromId)}
                  iconLeft={<SkipForward className="h-3.5 w-3.5" />}
                >
                  Continue from here
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
                    Prompt sent to the provider
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="whitespace-pre-wrap border-t border-line px-3 py-2 text-[11px] leading-relaxed text-ink-3">
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
            description="Load a SKU or pick an opening frame, describe the motion, then generate. Rendering takes about a minute."
          />
        )}
      </section>

      <section aria-labelledby="history" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="history" className="text-lg font-semibold tracking-tight text-ink">
            Recent clips
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadHistory()}
            iconLeft={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
        </div>

        {historyItems.length ? (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {historyItems.map((item) => {
              const videoUrl = item.asset_url ?? item.url;
              if (!videoUrl) return null;
              const meta = item.video_meta ?? {};
              const mode = readMeta(meta, "conditioningMode");
              const risk = readMeta(meta, "fidelityRisk");
              const shotLabel = readMeta(meta, "shotLabel");
              const sku = readMeta(meta, "skuCode");

              return (
                <Card key={item.id} className="overflow-hidden">
                  <video className="w-full bg-black" src={videoUrl} controls preload="metadata" playsInline />
                  <div className="space-y-2.5 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {sku ? <Badge tone="accent">{sku}</Badge> : null}
                      {shotLabel ? <Badge>{shotLabel}</Badge> : null}
                      {mode ? <Badge>{modeLabel(mode)}</Badge> : null}
                      {risk ? (
                        <Badge tone={risk === "low" ? "success" : risk === "medium" ? "warning" : "danger"}>
                          {risk} risk
                        </Badge>
                      ) : null}
                      <Badge>{readMetaNumber(meta, "durationSeconds", 6)}s</Badge>
                      <Badge>{asAspectRatio(readMeta(meta, "aspectRatio") || "9:16")}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <DownloadButton
                        url={videoUrl}
                        filenamePrefix={`megaska-clip-${item.id}`}
                        label="Save"
                        mimeType="video/mp4"
                      />
                      <ActionMenu
                        label="Clip actions"
                        items={[
                          {
                            key: "continue",
                            label: "Continue from this clip",
                            icon: <SkipForward className="h-3.5 w-3.5" />,
                            disabled: Boolean(continuingFromId),
                            onSelect: () =>
                              void continueFromClip({
                                id: item.id,
                                videoUrl,
                                aspectRatio: asAspectRatio(readMeta(meta, "aspectRatio") || "9:16"),
                              }),
                          },
                          {
                            key: "delete",
                            label: "Delete clip",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            destructive: true,
                            onSelect: () => setPendingDelete(item),
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
            description="Every clip is stored here with the conditioning it used, so you can compare takes."
          />
        )}
      </section>

      <Modal
        open={Boolean(pickerTarget)}
        onClose={() => setPickerTarget(null)}
        title={`Choose ${pickerLabel}`}
        description="Images from your Image Project gallery."
        size="xl"
        footer={
          <div className="flex justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadGalleryImages()}
              iconLeft={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
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
                    onClick={() => applyPickedImage(item)}
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
            description="Generate images in the Image Project first — they appear here as frame candidates."
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this clip?"
        description="The video file and its generation record are removed permanently."
        confirmLabel="Delete clip"
        busy={Boolean(pendingDelete && isDeletingHistoryId === pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void handleDeleteHistoryItem(pendingDelete);
        }}
      />
    </PageShell>
  );
}
