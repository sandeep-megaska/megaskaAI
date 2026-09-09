"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Anchor,
  ArrowRight,
  BadgeCheck,
  Check,
  Crown,
  FileText,
  Layers,
  Sparkles,
  Trash2,
  Video,
  Wand2,
  X,
} from "lucide-react";
import DownloadButton from "@/components/ui/DownloadButton";
import ActionMenu from "@/components/ui/ActionMenu";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DropZone from "@/components/ui/DropZone";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import MediaFrame from "@/components/ui/MediaFrame";
import Modal from "@/components/ui/Modal";
import PageShell from "@/components/ui/PageShell";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Badge, Card, EmptyState, SectionHeading, Skeleton, Well } from "@/components/ui/Surface";
import { revealResults } from "@/components/ui/revealResults";
import { cn } from "@/lib/cn";
import { isGeminiImageModel } from "@/lib/ai/backendFamilies";
import { STUDIO_ASPECT_RATIO_OPTIONS, type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import { GARMENT_ROLE_LABELS, GARMENT_VIEW_ROLES, type GarmentViewRole } from "@/lib/garment/roles";
import { suggestRoleFromMetadata } from "@/lib/garment/suggestRole";
import {
  clearStagedImageReferences,
  clearStagedVideoAnchors,
  getIncomingVideoAssets,
  getStagedImageReferences,
  getStagedVideoAnchors,
  removeStagedImageReference,
  sendAssetToVideoProject,
  stageImageReference,
  stageVideoAnchorCandidate,
  type StagedImageAsset,
} from "@/lib/studio/internalAssetBridge";
import { buildMasterCandidatePrompt, buildMoreViewsPrompt, type StudioWorkflowMode } from "@/lib/studio/prompts";

type AIBackend = { id: string; name: string; type: "image" | "video"; model: string };

type GenerationItem = {
  id: string;
  prompt: string;
  aspect_ratio: StudioAspectRatio;
  created_at?: string;
  asset_url?: string;
  url?: string;
  overlay_json?: Record<string, unknown> | null;
};
type SkuTruthDialogState = {
  item: GenerationItem;
  skuCode: string;
  role: string;
  sourceKind: "sku_verified_truth" | "manual_verified_override";
  suggestedRole: string | null;
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

type StudioResultItem = {
  id: string;
  url: string;
  prompt: string;
  workflowMode: StudioWorkflowMode;
  masterGenerationId: string | null;
  backendModel?: string;
  referenceKindsUsed: string[];
  promptHash: string;
};

type SelectedMaster = {
  selectedMasterImage: StudioResultItem | null;
  selectedMasterGenerationId: string | null;
  selectedMasterUrl: string | null;
  selectedMasterMetadata: Record<string, unknown> | null;
};

/** Map a studio aspect ratio onto the closest MediaFrame shape so gallery
 *  thumbnails stop cropping portrait generations into a 16:9 letterbox. */
function ratioToFrame(ratio: string | undefined): "square" | "portrait" | "landscape" {
  if (!ratio) return "square";
  const [width, height] = ratio.split(":").map(Number);
  if (!width || !height) return "square";
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

const quickActions = [
  "Back View",
  "Side View",
  "3/4 View",
  "Detail Upper",
  "Detail Lower",
  "Seated Pose",
  "Walking Pose",
  "Poolside Luxury",
  "Resort Editorial",
  "Indoor Premium",
];

function HomeContent() {
  const GALLERY_PAGE_SIZE = 12;
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<StudioAspectRatio>("3:4");
  const [backendId, setBackendId] = useState("");
  const [workflowMode, setWorkflowMode] = useState<StudioWorkflowMode>("master-candidates");
  const [garmentReferenceUrls, setGarmentReferenceUrls] = useState<string[]>([]);
  const [modelReferenceUrls, setModelReferenceUrls] = useState<string[]>([]);
  const [outputCount, setOutputCount] = useState<number>(4);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBuildingPrompt, setIsBuildingPrompt] = useState(false);
  const [promptBuilderResult, setPromptBuilderResult] = useState<PromptBuilderResponse["data"] | null>(null);
  const [promptBuilderInlineError, setPromptBuilderInlineError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backends, setBackends] = useState<AIBackend[]>([]);
  const [results, setResults] = useState<StudioResultItem[]>([]);
  const [masterState, setMasterState] = useState<SelectedMaster>({
    selectedMasterImage: null,
    selectedMasterGenerationId: null,
    selectedMasterUrl: null,
    selectedMasterMetadata: null,
  });
  const [galleryItems, setGalleryItems] = useState<GenerationItem[]>([]);
  const [galleryPage, setGalleryPage] = useState(0);
  const [hasMoreGalleryItems, setHasMoreGalleryItems] = useState(true);
  const [isLoadingMoreGallery, setIsLoadingMoreGallery] = useState(false);
  const [promptDialogItem, setPromptDialogItem] = useState<GenerationItem | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<StagedImageAsset[]>([]);
  const [selectedAnchorImages, setSelectedAnchorImages] = useState<StagedImageAsset[]>([]);
  const [sentToVideoImages, setSentToVideoImages] = useState<StagedImageAsset[]>([]);
  const [skuTruthDialog, setSkuTruthDialog] = useState<SkuTruthDialogState | null>(null);
  const [isSavingSkuTruth, setIsSavingSkuTruth] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<"garment" | "model" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GenerationItem | null>(null);

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const geminiImageBackends = useMemo(
    () => backends.filter((backend) => backend.type === "image" && isGeminiImageModel(backend.model)),
    [backends],
  );

  const canGenerateMoreViews = Boolean(masterState.selectedMasterUrl);
  const selectedMasterId = masterState.selectedMasterGenerationId;
  const derivedFromSelectedMaster = useMemo(
    () => results.filter((item) => item.workflowMode === "more-views" && item.masterGenerationId === selectedMasterId),
    [results, selectedMasterId],
  );
  const allOtherResults = useMemo(
    () => results.filter((item) => !(item.workflowMode === "more-views" && item.masterGenerationId === selectedMasterId)),
    [results, selectedMasterId],
  );

  useEffect(() => {
    if (workflowMode === "master-candidates") {
      setOutputCount((count) => (count === 3 ? 3 : 4));
      return;
    }
    setOutputCount((count) => (count > 1 ? 2 : 1));
  }, [workflowMode]);

  useEffect(() => {
    if (geminiImageBackends.length && !geminiImageBackends.some((backend) => backend.id === backendId)) {
      setBackendId(geminiImageBackends[0].id);
    }
  }, [backendId, geminiImageBackends]);

  const loadGallery = useCallback(async (page: number, reset = false) => {
    if (!supabase) return;
    const from = page * GALLERY_PAGE_SIZE;
    const to = from + GALLERY_PAGE_SIZE - 1;
    const { data } = await supabase
      .from("generations")
      .select("id,prompt,aspect_ratio,created_at,asset_url,url,overlay_json,generation_kind")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .range(from, to);

    const nextItems = (data ?? []) as GenerationItem[];
    setGalleryItems((current) => {
      if (reset) return nextItems;
      const existingIds = new Set(current.map((item) => item.id));
      const deduped = nextItems.filter((item) => !existingIds.has(item.id));
      return [...current, ...deduped];
    });
    setGalleryPage(page + 1);
    setHasMoreGalleryItems(nextItems.length === GALLERY_PAGE_SIZE);
  }, [GALLERY_PAGE_SIZE, supabase]);

  const formatGeneratedAt = useCallback((value?: string) => {
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
    setGalleryPage(0);
    void loadGallery(0, true);
  }, [loadGallery, supabase]);

  useEffect(() => {
    async function loadOptions() {
      const backendsRes = await fetch("/api/ai/backends");
      const backendJson = await backendsRes.json();
      setBackends(backendJson.data ?? []);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    setSelectedReferenceImages(getStagedImageReferences());
    setSelectedAnchorImages(getStagedVideoAnchors());
    setSentToVideoImages(getIncomingVideoAssets());
  }, []);

  useEffect(() => {
    const masterGenerationId = searchParams.get("masterGenerationId");
    const masterUrl = searchParams.get("masterUrl");
    if (!masterGenerationId || !masterUrl) return;

    const sourceVideoGenerationId = searchParams.get("sourceVideoGenerationId");
    const extractedAt = searchParams.get("extractedAt");
    const extractedDateLabel =
      extractedAt && !Number.isNaN(new Date(extractedAt).getTime())
        ? new Intl.DateTimeFormat(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(extractedAt))
        : null;

    setMasterState({
      selectedMasterImage: null,
      selectedMasterGenerationId: masterGenerationId,
      selectedMasterUrl: masterUrl,
      selectedMasterMetadata: {
        extractedFromVideo: true,
        sourceVideoGenerationId,
        extractedAt,
      },
    });
    setWorkflowMode("more-views");
    setOutputCount(1);
    setHandoffNotice(
      `Video frame is now active as your master${sourceVideoGenerationId ? ` (source video: ${sourceVideoGenerationId.slice(0, 8)}…)` : ""}${
        extractedDateLabel ? ` · extracted ${extractedDateLabel}` : ""
      }. Continue with Generate More Views.`,
    );
  }, [searchParams]);

  async function uploadFiles(files: FileList | null, kind: "garment" | "model") {
    if (!files?.length || uploadingKind) return;

    setUploadingKind(kind);
    setError(null);

    try {
      const uploaded: string[] = [];
      let failures = 0;

      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();
        if (res.ok && json.public_url) uploaded.push(json.public_url);
        else failures += 1;
      }

      // A silent no-op used to be the only signal that an upload had failed.
      if (failures) {
        setError(
          failures === files.length
            ? "None of those files could be uploaded. Check the file type and size, then try again."
            : `${failures} of ${files.length} files could not be uploaded.`,
        );
      }

      if (!uploaded.length) return;

      if (kind === "garment") {
        setGarmentReferenceUrls((current) => [...current, ...uploaded]);
        return;
      }

      setModelReferenceUrls((current) => [...current, ...uploaded]);
    } finally {
      setUploadingKind(null);
    }
  }

  function buildRequestForMode() {
    if (workflowMode === "master-candidates") {
      const wrappedPrompt = buildMasterCandidatePrompt({
        userPrompt: prompt,
        hasModelReferences: modelReferenceUrls.length > 0,
      });

    const referenceUrls = [...modelReferenceUrls, ...garmentReferenceUrls];
    const internalReferenceUrls = selectedReferenceImages.map((item) => item.url);

    return {
      prompt: wrappedPrompt,
      referenceUrls: [...referenceUrls, ...internalReferenceUrls],
      referenceKindsUsed: [
        ...(modelReferenceUrls.length ? ["model"] : []),
        ...(garmentReferenceUrls.length ? ["garment"] : []),
        ...(internalReferenceUrls.length ? ["internal-reference"] : []),
      ],
      masterGenerationId: null,
    };
    }

    const wrappedPrompt = buildMoreViewsPrompt({ userPrompt: prompt });
    const referenceUrls = [
      ...(masterState.selectedMasterUrl ? [masterState.selectedMasterUrl] : []),
      ...garmentReferenceUrls,
      ...modelReferenceUrls,
      ...selectedReferenceImages.map((item) => item.url),
    ];

    return {
      prompt: wrappedPrompt,
      referenceUrls,
      referenceKindsUsed: [
        ...(masterState.selectedMasterUrl ? ["master"] : []),
        ...(garmentReferenceUrls.length ? ["garment"] : []),
        ...(modelReferenceUrls.length ? ["model"] : []),
        ...(selectedReferenceImages.length ? ["internal-reference"] : []),
      ],
      masterGenerationId: masterState.selectedMasterGenerationId,
    };
  }

  function mapGenerationToStagedAsset(item: GenerationItem): StagedImageAsset | null {
    const src = item.asset_url || item.url;
    if (!src) return null;
    return {
      id: item.id,
      url: src,
      prompt: item.prompt || "Gallery image",
      createdAt: item.created_at ?? new Date().toISOString(),
    };
  }

  function handleUseAsReference(item: GenerationItem) {
    const mapped = mapGenerationToStagedAsset(item);
    if (!mapped) return;
    const staged = stageImageReference(mapped);
    setSelectedReferenceImages(staged);
    setHandoffNotice(`Added to references. ${staged.length} gallery reference${staged.length === 1 ? "" : "s"} in use.`);
  }

  function handleUseAsAnchor(item: GenerationItem) {
    const mapped = mapGenerationToStagedAsset(item);
    if (!mapped) return;
    const staged = stageVideoAnchorCandidate(mapped);
    setSelectedAnchorImages(staged);
    setHandoffNotice(`Staged as a video anchor. ${staged.length} anchor${staged.length === 1 ? "" : "s"} ready.`);
  }

  function handleSendToVideo(item: GenerationItem) {
    const mapped = mapGenerationToStagedAsset(item);
    if (!mapped) return;
    const sent = sendAssetToVideoProject(mapped);
    setSentToVideoImages(sent);
    setHandoffNotice(`Sent to the Video Project. ${sent.length} image${sent.length === 1 ? "" : "s"} waiting there.`);
  }

  function suggestSkuRole(item: GenerationItem): string | null {
    const overlay = item.overlay_json ?? {};
    const studioMetaRole = typeof overlay["role"] === "string" ? overlay["role"] : null;
    const label = typeof overlay["label"] === "string" ? overlay["label"] : null;
    const tags = Array.isArray(overlay["tags"]) ? overlay["tags"].filter((tag): tag is string => typeof tag === "string") : null;
    return suggestRoleFromMetadata({
      role: studioMetaRole,
      sourceKind: typeof overlay["source_kind"] === "string" ? overlay["source_kind"] : null,
      prompt: item.prompt,
      label,
      tags,
    });
  }

  function openSkuTruthDialog(item: GenerationItem) {
    const suggestedRole = suggestSkuRole(item);
    setSkuTruthDialog({
      item,
      skuCode: "",
      role: suggestedRole ?? "",
      sourceKind: "sku_verified_truth",
      suggestedRole,
    });
  }

  async function handleSaveAsSkuTruth() {
    if (!skuTruthDialog) return;
    const generationId = skuTruthDialog.item.id?.trim();
    const skuCode = skuTruthDialog.skuCode.trim().toUpperCase();
    if (!generationId) return setError("Selected image is missing generation ID.");
    if (!skuCode) return setError("Enter SKU code before saving.");
    if (!skuTruthDialog.role.trim()) return setError("Select a role before saving.");

    try {
      setError(null);
      setIsSavingSkuTruth(true);
      const res = await fetch("/api/garment-library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku_code: skuCode,
          role: skuTruthDialog.role,
          generation_id: generationId,
          source_kind: skuTruthDialog.sourceKind,
          label: "Saved from Image Project",
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to save SKU truth.");

      setHandoffNotice(
        `Saved as the ${skuTruthDialog.role.replace(/_/g, " ")} view for ${skuCode}. The Video Project can now pin clips to it.`,
      );
      setSkuTruthDialog(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save SKU truth.");
    } finally {
      setIsSavingSkuTruth(false);
    }
  }

  function normalizeApiError(status: number, fallback: string) {
    if (status === 429 || status === 503) {
      return "AI image service is busy right now. Please retry.";
    }
    return fallback;
  }

  function hashPrompt(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }
    return `p-${Math.abs(hash).toString(36)}`;
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
          projectType: "image",
          workflowMode: null,
          userIdea: prompt.trim(),
          environment: workflowMode === "more-views" ? "derived-views" : "master-candidates",
          motionPreset: null,
          garmentAnchors: {},
          hasStartFrame: false,
          hasEndFrame: false,
          hasReferenceImages: garmentReferenceUrls.length + modelReferenceUrls.length + selectedReferenceImages.length > 0,
        }),
      });

      const payload = (await response.json()) as PromptBuilderResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "Failed to generate prompt.");
      }

      setPromptBuilderResult(payload.data);
      const nextPrompt = payload.data.imagePrompt.trim();
      if (!nextPrompt) {
        setPromptBuilderInlineError("Prompt Builder returned an empty image prompt. Please adjust the idea and try again.");
        return;
      }

      setPrompt(nextPrompt);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Failed to generate prompt.");
    } finally {
      setIsBuildingPrompt(false);
    }
  }

  async function handleGenerate() {
    if (isGenerating) return;
    if (workflowMode === "more-views" && !canGenerateMoreViews) return;

    try {
      setIsGenerating(true);
      setError(null);

      const request = buildRequestForMode();
      const totalOutputs = workflowMode === "master-candidates" ? outputCount : outputCount;
      const promptHash = hashPrompt(request.prompt);

      const generationCalls = Array.from({ length: totalOutputs }).map(async () => {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "image",
            prompt: request.prompt,
            aspect_ratio: aspectRatio,
            ai_backend_id: backendId || null,
            reference_urls: request.referenceUrls,
            studio_meta: {
              studioWorkflowMode: workflowMode,
              masterGenerationId: request.masterGenerationId,
              referenceKindsUsed: request.referenceKindsUsed,
              promptHash,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(normalizeApiError(res.status, data.error || "Generation failed"));
        }

        return {
          id: data.generationId,
          url: data.outputUrl,
          prompt,
          workflowMode,
          masterGenerationId: request.masterGenerationId,
          backendModel: data.backendModel,
          referenceKindsUsed: request.referenceKindsUsed,
          promptHash,
        } satisfies StudioResultItem;
      });

      const generatedItems = await Promise.all(generationCalls);
      setResults((current) => [...generatedItems, ...current]);
      setGalleryPage(0);
      await loadGallery(0, true);
      revealResults("session-results");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  function applyQuickAction(action: string) {
    setPrompt((current) => {
      if (!current.trim()) return action;
      return `${current.trim()}, ${action}`;
    });
  }

  function selectAsMaster(item: StudioResultItem) {
    setMasterState({
      selectedMasterImage: item,
      selectedMasterGenerationId: item.id,
      selectedMasterUrl: item.url,
      selectedMasterMetadata: { workflowMode: item.workflowMode },
    });
    if (workflowMode === "master-candidates") {
      setWorkflowMode("more-views");
      setOutputCount(1);
    }
  }

  async function handleDeleteGeneration(item: GenerationItem) {
    if (isDeletingId) return;

    try {
      setIsDeletingId(item.id);
      const response = await fetch(`/api/generations/${item.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Delete failed.");
      }
      setGalleryItems((current) => current.filter((entry) => entry.id !== item.id));
      setHasMoreGalleryItems(true);
      if (promptDialogItem?.id === item.id) {
        setPromptDialogItem(null);
      }
      if (masterState.selectedMasterGenerationId === item.id) {
        setMasterState({
          selectedMasterImage: null,
          selectedMasterGenerationId: null,
          selectedMasterUrl: null,
          selectedMasterMetadata: null,
        });
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    } finally {
      setIsDeletingId(null);
      setPendingDelete(null);
    }
  }

  async function handleLoadMoreGallery() {
    if (isLoadingMoreGallery || !hasMoreGalleryItems) return;
    setIsLoadingMoreGallery(true);
    try {
      await loadGallery(galleryPage, false);
    } finally {
      setIsLoadingMoreGallery(false);
    }
  }

  const activeResults = [...derivedFromSelectedMaster, ...allOtherResults];
  const referenceTotal =
    garmentReferenceUrls.length + modelReferenceUrls.length + selectedReferenceImages.length;
  const generateDisabledReason = !backendId
    ? "Loading available models…"
    : workflowMode === "more-views" && !canGenerateMoreViews
      ? "Select a master image first."
      : null;

  return (
    <PageShell
      accent="violet"
      eyebrow="Studio Project"
      title="Image Project"
      description="Generate master candidates, promote the strongest one to master, then expand it into more views."
      headerAction={
        <Link
          href="/video/simple"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong px-3.5 text-sm font-medium text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
        >
          <Video className="h-4 w-4" aria-hidden />
          Video Project
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
      rail={
        <div className="space-y-4">
          {/* Step 1 — what are we making? Everything below reacts to this. */}
          <Card className="space-y-3 p-4">
            <SectionHeading
              step={1}
              title="Workflow"
              description={
                workflowMode === "master-candidates"
                  ? "Create 3–4 strong front-view candidates from your references."
                  : "Use the master image as an anchor for back, side, detail or lifestyle variations."
              }
            />
            <SegmentedControl
              label="Studio workflow"
              value={workflowMode}
              columns={1}
              onChange={(next) => setWorkflowMode(next)}
              options={[
                {
                  value: "master-candidates",
                  label: "Generate master candidates",
                  description: "Start here. Produces several options to choose from.",
                },
                {
                  value: "more-views",
                  label: "Generate more views",
                  description: "Expand your chosen master into other angles.",
                  disabled: !canGenerateMoreViews,
                  disabledReason: "Select a generated candidate as master first.",
                },
              ]}
            />

            {masterState.selectedMasterUrl ? (
              <Well className="flex items-center gap-3 p-2.5">
                <MediaFrame
                  src={masterState.selectedMasterUrl}
                  alt="Selected master image"
                  ratio="square"
                  className="h-14 w-14 shrink-0 rounded-lg"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-accent">Master image</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
                    Anchors every &ldquo;more views&rdquo; generation.
                  </p>
                </div>
              </Well>
            ) : null}
          </Card>

          {/* Step 2 — the prompt, given the most room of any control. */}
          <Card className="space-y-3 p-4">
            <SectionHeading step={2} title="Prompt" />

            <TextAreaField
              label="Describe the shot"
              hint="Subject, wardrobe, setting, lighting and camera framing."
              value={prompt}
              maxLength={2000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                workflowMode === "master-candidates"
                  ? "Premium front-view swimwear campaign shot, natural daylight, sand backdrop…"
                  : "Back view, side angle, detail shot, poolside luxury…"
              }
            />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleGeneratePrompt}
                loading={isBuildingPrompt}
                disabled={!prompt.trim()}
                iconLeft={<Wand2 className="h-3.5 w-3.5" />}
              >
                Refine with Prompt Builder
              </Button>
              {promptBuilderResult ? (
                <div className="flex flex-wrap gap-1.5">
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
                  <Badge>{promptBuilderResult.recommendedMode.replace("_", " ")}</Badge>
                </div>
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

            {workflowMode === "more-views" ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-ink-2">Quick additions</p>
                <div className="flex flex-wrap gap-1.5">
                  {quickActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => applyQuickAction(action)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
                    >
                      + {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          {/* Step 3 — references, with real previews instead of a bare file input. */}
          <Card className="space-y-4 p-4">
            <SectionHeading
              step={3}
              title="References"
              description="Optional, but they are what keep the garment and the model consistent."
              action={referenceTotal ? <Badge tone="accent">{referenceTotal}</Badge> : null}
            />

            <DropZone
              label="Garment references"
              hint="Flat lays or on-body shots of the product itself."
              urls={garmentReferenceUrls}
              uploading={uploadingKind === "garment"}
              onFiles={(files) => void uploadFiles(files, "garment")}
              onRemove={(url) => setGarmentReferenceUrls((current) => current.filter((entry) => entry !== url))}
            />

            <DropZone
              label="Model references"
              hint="Face, body and posing references for identity continuity."
              urls={modelReferenceUrls}
              uploading={uploadingKind === "model"}
              onFiles={(files) => void uploadFiles(files, "model")}
              onRemove={(url) => setModelReferenceUrls((current) => current.filter((entry) => entry !== url))}
            />

            {selectedAnchorImages.length || sentToVideoImages.length ? (
              <Well className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink-2">Staged for the Video Project</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
                      {selectedAnchorImages.length} anchor{selectedAnchorImages.length === 1 ? "" : "s"} ·{" "}
                      {sentToVideoImages.length} sent
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearStagedVideoAnchors();
                      setSelectedAnchorImages([]);
                    }}
                    className="shrink-0 text-xs text-ink-3 transition-colors hover:text-ink"
                  >
                    Clear
                  </button>
                </div>
                <Link
                  href="/video/simple"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-80"
                >
                  Open Video Project
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Well>
            ) : null}

            {selectedReferenceImages.length ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">From your gallery</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearStagedImageReferences();
                      setSelectedReferenceImages([]);
                    }}
                    className="text-xs text-ink-3 transition-colors hover:text-ink"
                  >
                    Clear all
                  </button>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {selectedReferenceImages.map((item) => (
                    <li key={`reference-${item.id}`} className="relative">
                      <MediaFrame
                        src={item.url}
                        alt={item.prompt}
                        ratio="square"
                        className="h-16 w-16 rounded-lg border border-line"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedReferenceImages(removeStagedImageReference(item.id))}
                        aria-label="Remove gallery reference"
                        className="absolute -right-1.5 -top-1.5 rounded-full border border-line-strong bg-raised p-1 text-ink-2 transition-colors hover:border-danger/60 hover:text-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-ink-3">
                Tip: use <span className="text-ink-2">Use as reference</span> on any gallery image to add it here.
              </p>
            )}
          </Card>

          {/* Step 4 — output settings, the least-often-changed group, so last. */}
          <Card className="space-y-3 p-4">
            <SectionHeading step={4} title="Output" />

            <SelectField
              label="Aspect ratio"
              hint="Pick the format for where the image will run."
              value={aspectRatio}
              onChange={(event) => setAspectRatio(event.target.value as StudioAspectRatio)}
            >
              {STUDIO_ASPECT_RATIO_OPTIONS.map((option) => (
                <option key={option.id} value={option.ratio}>
                  {option.label} — {option.ratio}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Model"
              value={backendId}
              onChange={(event) => setBackendId(event.target.value)}
              disabled={!geminiImageBackends.length}
            >
              {geminiImageBackends.length ? (
                geminiImageBackends.map((backend) => (
                  <option key={backend.id} value={backend.id}>
                    {backend.name}
                  </option>
                ))
              ) : (
                <option value="">Loading models…</option>
              )}
            </SelectField>

            <SelectField
              label="Variations"
              hint="More variations cost more but give you a better pick."
              value={outputCount}
              onChange={(event) => setOutputCount(Number(event.target.value))}
            >
              {workflowMode === "master-candidates" ? (
                <>
                  <option value={4}>4 images (recommended)</option>
                  <option value={3}>3 images</option>
                </>
              ) : (
                <>
                  <option value={1}>1 image (recommended)</option>
                  <option value={2}>2 images</option>
                </>
              )}
            </SelectField>
          </Card>

          {error ? (
            <Alert tone="danger" title="Generation failed" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          ) : null}

          {/* The primary action stays reachable instead of sitting below ten
              controls the way it used to. */}
          <div className="-mx-1 px-1 pb-1 pt-1 xl:sticky xl:bottom-0 xl:bg-gradient-to-t xl:from-canvas xl:from-75% xl:to-transparent xl:pb-2 xl:pt-8">
            <Button
              variant="primary"
              size="lg"
              block
              onClick={handleGenerate}
              loading={isGenerating}
              disabled={Boolean(generateDisabledReason)}
              iconLeft={<Sparkles className="h-4 w-4" />}
            >
              {isGenerating
                ? "Generating…"
                : workflowMode === "master-candidates"
                  ? `Generate ${outputCount} candidates`
                  : `Generate ${outputCount === 1 ? "view" : `${outputCount} views`}`}
            </Button>
            {generateDisabledReason ? (
              <p className="mt-1.5 text-center text-[11px] text-ink-3">{generateDisabledReason}</p>
            ) : null}
          </div>
        </div>
      }
    >
      {handoffNotice ? (
        <Alert tone="success" onDismiss={() => setHandoffNotice(null)}>
          {handoffNotice}
        </Alert>
      ) : null}

      <section aria-labelledby="session-results" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="session-results" className="text-lg font-semibold tracking-tight text-ink">
            This session
          </h2>
          {activeResults.length ? (
            <span className="text-xs text-ink-3">{activeResults.length} generated</span>
          ) : null}
        </div>

        {isGenerating ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: outputCount }).map((_, index) => (
              <Skeleton key={index} className="aspect-square" />
            ))}
          </div>
        ) : activeResults.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {activeResults.map((item) => {
              const isMaster = masterState.selectedMasterGenerationId === item.id;
              return (
                <Card
                  key={`${item.workflowMode}-${item.id}`}
                  className={cn("overflow-hidden transition-colors", isMaster && "border-accent/60")}
                >
                  <MediaFrame src={item.url} alt={item.prompt} ratio={ratioToFrame(aspectRatio)} />
                  <div className="space-y-2.5 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={item.workflowMode === "master-candidates" ? "neutral" : "accent"}>
                        {item.workflowMode === "master-candidates" ? "Candidate" : "More views"}
                      </Badge>
                      {item.workflowMode === "more-views" && item.masterGenerationId === selectedMasterId ? (
                        <Badge tone="accent">From current master</Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isMaster ? "primary" : "secondary"}
                        onClick={() => selectAsMaster(item)}
                        iconLeft={isMaster ? <Check className="h-3.5 w-3.5" /> : <Crown className="h-3.5 w-3.5" />}
                        className="flex-1"
                      >
                        {isMaster ? "Master" : "Use as master"}
                      </Button>
                      <DownloadButton url={item.url} filenamePrefix={`studio-result-${item.id}`} label="Save" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="Nothing generated yet"
            description="Write a prompt, add a reference or two, then generate your first set of master candidates."
          />
        )}
      </section>

      <section aria-labelledby="gallery" className="space-y-3">
        <h2 id="gallery" className="text-lg font-semibold tracking-tight text-ink">
          Gallery
        </h2>

        {galleryItems.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {galleryItems.map((item) => {
              const src = item.asset_url || item.url;
              const workflow = item.overlay_json?.["studioWorkflowMode"];
              const galleryMasterGenerationId =
                (item.overlay_json?.["masterGenerationId"] as string | undefined) ?? null;
              const isCurrentMaster = masterState.selectedMasterGenerationId === item.id;
              const canUseAsMaster = typeof workflow === "string";

              return (
                <Card
                  key={item.id}
                  className={cn("overflow-hidden transition-colors", isCurrentMaster && "border-accent/60")}
                >
                  <MediaFrame
                    src={src}
                    alt={item.prompt || "Generated image"}
                    ratio={ratioToFrame(item.aspect_ratio)}
                  />

                  <div className="space-y-2.5 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge>{String(workflow ?? "legacy")}</Badge>
                      {galleryMasterGenerationId && selectedMasterId === galleryMasterGenerationId ? (
                        <Badge tone="accent">From current master</Badge>
                      ) : null}
                    </div>

                    <p className="text-[11px] text-ink-3">{formatGeneratedAt(item.created_at)}</p>

                    {/* One primary action on the card; the other six live in the
                        overflow menu instead of forming a wall of buttons. */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isCurrentMaster ? "primary" : "secondary"}
                        disabled={!canUseAsMaster || !src}
                        onClick={() =>
                          src &&
                          selectAsMaster({
                            id: item.id,
                            url: src,
                            prompt: item.prompt,
                            workflowMode: workflow === "more-views" ? "more-views" : "master-candidates",
                            masterGenerationId: galleryMasterGenerationId,
                            backendModel: (item.overlay_json?.["backendModel"] as string | undefined) ?? undefined,
                            referenceKindsUsed: Array.isArray(item.overlay_json?.["referenceKindsUsed"])
                              ? (item.overlay_json?.["referenceKindsUsed"] as string[])
                              : [],
                            promptHash: String(item.overlay_json?.["promptHash"] ?? ""),
                          })
                        }
                        iconLeft={
                          isCurrentMaster ? <Check className="h-3.5 w-3.5" /> : <Crown className="h-3.5 w-3.5" />
                        }
                        className="flex-1"
                      >
                        {isCurrentMaster ? "Master" : "Use as master"}
                      </Button>

                      {src ? <DownloadButton url={src} filenamePrefix={`gallery-${item.id}`} label="Save" /> : null}

                      <ActionMenu
                        label={`More actions for image generated ${formatGeneratedAt(item.created_at)}`}
                        items={[
                          {
                            key: "prompt",
                            label: "View prompt",
                            icon: <FileText className="h-3.5 w-3.5" />,
                            onSelect: () => setPromptDialogItem(item),
                          },
                          {
                            key: "reference",
                            label: "Use as reference",
                            icon: <Layers className="h-3.5 w-3.5" />,
                            disabled: !src,
                            onSelect: () => handleUseAsReference(item),
                          },
                          {
                            key: "anchor",
                            label: "Use as video anchor",
                            icon: <Anchor className="h-3.5 w-3.5" />,
                            disabled: !src,
                            onSelect: () => handleUseAsAnchor(item),
                          },
                          {
                            key: "send",
                            label: "Send to Video Project",
                            icon: <Video className="h-3.5 w-3.5" />,
                            disabled: !src,
                            onSelect: () => handleSendToVideo(item),
                          },
                          {
                            key: "sku",
                            label: "Save to garment library",
                            icon: <BadgeCheck className="h-3.5 w-3.5" />,
                            onSelect: () => openSkuTruthDialog(item),
                          },
                          {
                            key: "delete",
                            label: "Delete image",
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
            icon={<Layers className="h-6 w-6" />}
            title="Your gallery is empty"
            description="Generated images are saved here automatically, ready to reuse as references or video anchors."
          />
        )}

        {hasMoreGalleryItems && galleryItems.length ? (
          <div className="flex justify-center pt-1">
            <Button onClick={() => void handleLoadMoreGallery()} loading={isLoadingMoreGallery}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>

      <Modal
        open={Boolean(promptDialogItem)}
        onClose={() => setPromptDialogItem(null)}
        title="Prompt details"
        description={promptDialogItem ? formatGeneratedAt(promptDialogItem.created_at) : undefined}
        size="lg"
      >
        {promptDialogItem ? (
          <div className="space-y-3">
            <Well className="p-3">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">
                {promptDialogItem.prompt}
              </p>
            </Well>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-ink-3">Workflow</dt>
                <dd className="text-ink-2">{String(promptDialogItem.overlay_json?.["studioWorkflowMode"] ?? "legacy")}</dd>
              </div>
              {typeof promptDialogItem.overlay_json?.["backendModel"] === "string" ? (
                <div className="flex gap-2">
                  <dt className="text-ink-3">Model</dt>
                  <dd className="font-mono text-ink-2">
                    {String(promptDialogItem.overlay_json?.["backendModel"])}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(skuTruthDialog)}
        onClose={() => setSkuTruthDialog(null)}
        title="Save to garment library"
        description="Save this image as the verified view for one side of a product."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSkuTruthDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAsSkuTruth}
              loading={isSavingSkuTruth}
              disabled={!skuTruthDialog?.skuCode.trim() || !skuTruthDialog?.role.trim()}
            >
              Save
            </Button>
          </div>
        }
      >
        {skuTruthDialog ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <MediaFrame
                src={skuTruthDialog.item.asset_url || skuTruthDialog.item.url}
                alt="Image being saved as SKU truth"
                ratio="square"
                className="h-20 w-20 shrink-0 rounded-lg border border-line"
              />
              <p className="text-xs leading-relaxed text-ink-3">
                Saved views are what the Video Project pins clips to. A verified back view is what stops the reverse
                of the garment being invented during a turn.
              </p>
            </div>

            <TextField
              label="SKU code"
              required
              hint="Uppercase product code, for example MGSW05."
              placeholder="MGSW05"
              value={skuTruthDialog.skuCode}
              onChange={(event) =>
                setSkuTruthDialog((current) =>
                  current ? { ...current, skuCode: event.target.value.toUpperCase() } : current,
                )
              }
            />

            <SelectField
              label="Role"
              required
              hint={
                skuTruthDialog.suggestedRole
                  ? `Suggested from this image: ${skuTruthDialog.suggestedRole}`
                  : "No role could be inferred from this image — choose one."
              }
              value={skuTruthDialog.role}
              onChange={(event) =>
                setSkuTruthDialog((current) =>
                  current ? { ...current, role: event.target.value as GarmentViewRole } : current,
                )
              }
            >
              <option value="">Select a role…</option>
              {GARMENT_VIEW_ROLES.map((role) => (
                <option key={role} value={role}>
                  {GARMENT_ROLE_LABELS[role]}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Truth type"
              value={skuTruthDialog.sourceKind}
              onChange={(event) =>
                setSkuTruthDialog((current) =>
                  current
                    ? {
                        ...current,
                        sourceKind: event.target.value as "sku_verified_truth" | "manual_verified_override",
                      }
                    : current,
                )
              }
            >
              <option value="sku_verified_truth">Verified SKU truth</option>
              <option value="manual_verified_override">Manual override</option>
            </SelectField>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this image?"
        description="The image and its generation record are removed permanently. Anything already using it as a reference keeps the copy it made."
        confirmLabel="Delete image"
        busy={Boolean(pendingDelete && isDeletingId === pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void handleDeleteGeneration(pendingDelete);
        }}
      />
    </PageShell>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
