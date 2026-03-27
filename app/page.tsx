"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Sparkles, Trash2, X } from "lucide-react";
import DownloadAssetButton from "@/app/studio/video/v2/components/DownloadAssetButton";
import { isGeminiImageModel } from "@/lib/ai/backendFamilies";
import { STUDIO_ASPECT_RATIO_OPTIONS, type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import { SKU_TRUTH_ROLES, type SkuTruthRole } from "@/lib/video/v2/skuTruth/types";
import { buildImageProjectSkuTruthPayload } from "@/lib/video/v2/skuTruth/bridge";
import { suggestRoleFromMetadata } from "@/lib/video/v2/skuTruth/ui";
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
    if (!promptDialogItem) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPromptDialogItem(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [promptDialogItem]);

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
    if (!files?.length) return;
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok && json.public_url) uploaded.push(json.public_url);
    }

    if (!uploaded.length) return;

    if (kind === "garment") {
      setGarmentReferenceUrls((current) => [...current, ...uploaded]);
      return;
    }

    setModelReferenceUrls((current) => [...current, ...uploaded]);
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
    setSelectedReferenceImages(stageImageReference(mapped));
  }

  function handleUseAsAnchor(item: GenerationItem) {
    const mapped = mapGenerationToStagedAsset(item);
    if (!mapped) return;
    setSelectedAnchorImages(stageVideoAnchorCandidate(mapped));
  }

  function handleSendToVideo(item: GenerationItem) {
    const mapped = mapGenerationToStagedAsset(item);
    if (!mapped) return;
    setSentToVideoImages(sendAssetToVideoProject(mapped));
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
      const res = await fetch("/api/studio/video/v2/sku-truth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildImageProjectSkuTruthPayload({
          skuCode,
          role: skuTruthDialog.role,
          generationId,
          truthType: skuTruthDialog.sourceKind,
        })),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to save SKU truth.");

      setHandoffNotice(
        `Saved ${skuTruthDialog.sourceKind === "manual_verified_override" ? "manual override" : "verified truth"} for SKU ${skuCode} role ${skuTruthDialog.role}.`,
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

      setPrompt(payload.data.imagePrompt);
      setPromptBuilderResult(payload.data);
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
    if (!supabase || isDeletingId) return;
    const confirmed = window.confirm("Delete this generated image?");
    if (!confirmed) return;

    try {
      setIsDeletingId(item.id);
      const { error: deleteError } = await supabase.from("generations").delete().eq("id", item.id);
      if (deleteError) {
        throw deleteError;
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

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Studio Project</p>
                <h1 className="text-2xl font-semibold text-white">Image Project</h1>
                <p className="text-sm text-zinc-400">Generate master candidates, select the strongest result as master, and expand into more views.</p>
              </div>
              <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950/70 p-1">
                <Link href="/" className="rounded-md bg-indigo-500 px-4 py-2 text-sm text-white">Image Project</Link>
              </div>
            </div>

            <p className="text-sm font-medium text-zinc-300">Studio Workflow</p>
            <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950/70 p-1">
              <button type="button" onClick={() => setWorkflowMode("master-candidates")} className={`rounded-md px-4 py-2 text-sm ${workflowMode === "master-candidates" ? "bg-indigo-500 text-white" : "text-zinc-300"}`}>
                Generate Master Candidates
              </button>
              <button
                type="button"
                disabled={!canGenerateMoreViews}
                onClick={() => canGenerateMoreViews && setWorkflowMode("more-views")}
                className={`rounded-md px-4 py-2 text-sm ${workflowMode === "more-views" ? "bg-indigo-500 text-white" : "text-zinc-300"} disabled:opacity-40`}
              >
                Generate More Views
              </button>
            </div>
            {!canGenerateMoreViews && <p className="text-xs text-zinc-400">Select a generated candidate as master before generating more views.</p>}
            <p className="text-xs text-zinc-400">
              {workflowMode === "master-candidates"
                ? "Create 3–4 strong front-view candidates from garment and model references."
                : "Use the selected master image as the anchor to generate back, side, detail, or lifestyle variations with prompt-based control."}
            </p>
            {handoffNotice ? (
              <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {handoffNotice}
              </div>
            ) : null}
          </div>

          {masterState.selectedMasterUrl && (
            <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 p-3">
              <p className="text-sm font-medium text-indigo-200">Master Image</p>
              <div className="mt-2 flex items-center gap-3">
                <img src={masterState.selectedMasterUrl} alt="Selected master" className="h-24 w-24 rounded-md object-cover" />
                <p className="text-xs text-zinc-300">This image is the primary anchor for Generate More Views.</p>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-200">Selected References ({selectedReferenceImages.length})</p>
                <button
                  type="button"
                  onClick={() => {
                    clearStagedImageReferences();
                    setSelectedReferenceImages([]);
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  Clear
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedReferenceImages.map((item) => (
                  <div key={`reference-${item.id}`} className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-white/15">
                    <img src={item.url} alt={item.prompt} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setSelectedReferenceImages(removeStagedImageReference(item.id))}
                      className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-[10px]"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!selectedReferenceImages.length ? <p className="text-xs text-zinc-500">Use “Use as Reference” on any gallery image.</p> : null}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-200">Video Bridge · Anchors {selectedAnchorImages.length} · Sent {sentToVideoImages.length}</p>
                <button
                  type="button"
                  onClick={() => {
                    clearStagedVideoAnchors();
                    setSelectedAnchorImages([]);
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  Clear Anchors
                </button>
              </div>
              <p className="text-xs text-zinc-500">Use “Use as Anchor” or “Send to Video Project” on gallery cards. Open Video Project to assign slots directly.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={workflowMode === "master-candidates" ? "Premium front-view swimwear campaign shot..." : "Back view, side angle, detail shot, poolside luxury..."}
              className="h-28 w-full rounded-lg border border-white/10 bg-zinc-950/70 p-3 text-sm md:col-span-2"
            />
            <button
              type="button"
              onClick={handleGeneratePrompt}
              disabled={isBuildingPrompt || !prompt.trim()}
              className="rounded-lg border border-indigo-300/50 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-100 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              {isBuildingPrompt ? "Generating Prompt..." : "Generate Prompt"}
            </button>
            <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
              {promptBuilderResult
                ? `Risk: ${promptBuilderResult.riskLevel} · Recommended mode: ${promptBuilderResult.recommendedMode}`
                : "Prompt Builder will suggest cleaner provider-safe phrasing."}
            </div>
            <input type="file" accept="image/*" multiple onChange={(event) => uploadFiles(event.target.files, "garment")} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
            <input type="file" accept="image/*" multiple onChange={(event) => uploadFiles(event.target.files, "model")} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={aspectRatio}
              onChange={(event) => setAspectRatio(event.target.value as StudioAspectRatio)}
              className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm"
            >
              {STUDIO_ASPECT_RATIO_OPTIONS.map((option) => (
                <option key={option.id} value={option.ratio}>
                  {option.label} — {option.ratio}
                </option>
              ))}
            </select>
            <select value={backendId} onChange={(event) => setBackendId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm">
              {geminiImageBackends.map((backend) => (
                <option key={backend.id} value={backend.id}>
                  {backend.name}
                </option>
              ))}
            </select>
            <select
              value={outputCount}
              onChange={(event) => setOutputCount(Number(event.target.value))}
              className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm"
            >
              {workflowMode === "master-candidates" ? (
                <>
                  <option value={4}>4 outputs (default)</option>
                  <option value={3}>3 outputs</option>
                </>
              ) : (
                <>
                  <option value={1}>1 output (default)</option>
                  <option value={2}>2 outputs</option>
                </>
              )}
            </select>
          </div>

          <p className="text-xs text-zinc-400">Choose the output format best suited for Instagram, ads, catalog, or editorial use.</p>

          {workflowMode === "more-views" && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button key={action} type="button" onClick={() => applyQuickAction(action)} className="rounded-md border border-white/15 px-3 py-2 text-xs text-zinc-200">
                  {action}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-zinc-400">Garment refs: {garmentReferenceUrls.length} · Model refs: {modelReferenceUrls.length}</p>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !backendId || (workflowMode === "more-views" && !canGenerateMoreViews)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? "Generating..." : workflowMode === "master-candidates" ? "Generate Master Candidates" : "Generate More Views"}
          </button>

          {promptBuilderResult?.negativeConstraints?.length ? (
            <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
              <p className="font-medium text-zinc-200">Negative constraints</p>
              <p className="mt-1">{promptBuilderResult.negativeConstraints.join(" · ")}</p>
            </div>
          ) : null}

          {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Studio Results</h2>
          {selectedMasterId && (
            <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 p-3 text-xs text-indigo-100">
              Derived views for the selected master are grouped first for iterative branching.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...derivedFromSelectedMaster, ...allOtherResults].map((item) => (
              <article key={`${item.workflowMode}-${item.id}`} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60">
                <div className="aspect-square overflow-hidden bg-zinc-900">
                  <img src={item.url} alt={item.prompt} className="h-full w-full object-cover" />
                </div>
                <div className="space-y-2 p-3">
                  <p className="text-xs text-zinc-400">
                    {item.workflowMode === "master-candidates" ? "Master Candidate" : "More Views"}
                    {item.workflowMode === "more-views" && item.masterGenerationId === selectedMasterId ? " · Derived from current master" : ""}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => selectAsMaster(item)}
                      className={`rounded-md px-3 py-2 text-xs ${masterState.selectedMasterGenerationId === item.id ? "bg-indigo-500 text-white" : "border border-white/15"}`}
                    >
                      {masterState.selectedMasterGenerationId === item.id ? "Selected Master" : "Use as Master"}
                    </button>
                    <DownloadAssetButton url={item.url} filenamePrefix={`studio-result-${item.id}`} label="Download" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Gallery</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryItems.map((item) => {
              const src = item.asset_url || item.url;
              const workflow = item.overlay_json?.["studioWorkflowMode"];
              const galleryMasterGenerationId = (item.overlay_json?.["masterGenerationId"] as string | undefined) ?? null;
              const isCurrentMaster = masterState.selectedMasterGenerationId === item.id;
              const canUseAsMaster = typeof workflow === "string";
              return (
                <article key={item.id} className={`overflow-hidden rounded-xl border bg-zinc-950/60 ${isCurrentMaster ? "border-indigo-500/70" : "border-white/10"}`}>
                  <div className="aspect-video overflow-hidden bg-zinc-900">{src ? <img src={src} alt={item.prompt} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-zinc-500">No preview</div>}</div>
                  <div className="space-y-2 p-4">
                    <p className="text-xs text-zinc-400">
                      {String(workflow ?? "legacy")}
                      {galleryMasterGenerationId && selectedMasterId === galleryMasterGenerationId ? " · Derived from current master" : ""}
                    </p>
                    <p className="text-xs text-zinc-500">{formatGeneratedAt(item.created_at)}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
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
                        className={`rounded-md px-3 py-2 text-xs ${isCurrentMaster ? "bg-indigo-500 text-white" : "border border-white/15"} disabled:opacity-40`}
                      >
                        {isCurrentMaster ? "Selected Master" : "Use as Master"}
                      </button>
                      <button type="button" onClick={() => setPromptDialogItem(item)} className="rounded-md border border-white/15 px-3 py-2 text-xs text-zinc-200">
                        View Prompt
                      </button>
                      {src ? <DownloadAssetButton url={src} filenamePrefix={`gallery-${item.id}`} label="Download" /> : null}
                      <button type="button" disabled={!src} onClick={() => handleUseAsReference(item)} className="rounded-md border border-white/15 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40">
                        Use as Reference
                      </button>
                      <button type="button" disabled={!src} onClick={() => handleUseAsAnchor(item)} className="rounded-md border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40">
                        Use as Anchor
                      </button>
                      <button type="button" disabled={!src} onClick={() => handleSendToVideo(item)} className="rounded-md border border-indigo-400/40 px-3 py-2 text-xs text-indigo-200 disabled:opacity-40">
                        Send to Video Project
                      </button>
                      <button type="button" onClick={() => openSkuTruthDialog(item)} className="rounded-md border border-emerald-400/40 px-3 py-2 text-xs text-emerald-200">
                        Save as SKU Truth
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingId === item.id}
                        onClick={() => handleDeleteGeneration(item)}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-3 py-2 text-xs text-rose-200 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {hasMoreGalleryItems ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => void handleLoadMoreGallery()}
                disabled={isLoadingMoreGallery}
                className="rounded-md border border-white/15 px-4 py-2 text-sm text-zinc-200 disabled:opacity-50"
              >
                {isLoadingMoreGallery ? "Loading..." : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {promptDialogItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Prompt details"
          onClick={() => setPromptDialogItem(null)}
        >
          <div className="flex max-h-[80vh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-zinc-900 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">Prompt Details</h3>
                <p className="mt-1 text-xs text-zinc-400">{formatGeneratedAt(promptDialogItem.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPromptDialogItem(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 text-zinc-300 transition hover:bg-zinc-800"
                aria-label="Close prompt details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto px-4 py-3">
              <p className="whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-zinc-950/70 p-3 text-sm leading-relaxed text-zinc-200">
                {promptDialogItem.prompt}
              </p>
              <div className="text-xs text-zinc-400">
                <p>Workflow: {String(promptDialogItem.overlay_json?.["studioWorkflowMode"] ?? "legacy")}</p>
                {typeof promptDialogItem.overlay_json?.["backendModel"] === "string" && <p>Backend model: {String(promptDialogItem.overlay_json?.["backendModel"])}</p>}
              </div>
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              <button type="button" onClick={() => setPromptDialogItem(null)} className="rounded-md border border-white/15 px-3 py-2 text-xs text-zinc-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {skuTruthDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Save as SKU Truth" onClick={() => setSkuTruthDialog(null)}>
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-zinc-100">Save as SKU Truth</h3>
            <p className="mt-1 text-xs text-zinc-400">Use this selected image as approved truth for a SKU role.</p>
            <div className="mt-3 grid gap-3">
              <input
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                placeholder="SKU code (example: MGSW05)"
                value={skuTruthDialog.skuCode}
                onChange={(event) => setSkuTruthDialog((current) => current ? { ...current, skuCode: event.target.value.toUpperCase() } : current)}
              />
              <select
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={skuTruthDialog.role}
                onChange={(event) => setSkuTruthDialog((current) => current ? { ...current, role: event.target.value as SkuTruthRole } : current)}
              >
                <option value="">-- select role --</option>
                {SKU_TRUTH_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              {skuTruthDialog.suggestedRole ? <p className="text-xs text-emerald-300">Suggested role: {skuTruthDialog.suggestedRole}</p> : <p className="text-xs text-zinc-500">No safe role suggestion found. Please choose manually.</p>}
              <select
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={skuTruthDialog.sourceKind}
                onChange={(event) => setSkuTruthDialog((current) => current ? { ...current, sourceKind: event.target.value as "sku_verified_truth" | "manual_verified_override" } : current)}
              >
                <option value="sku_verified_truth">Verified SKU Truth</option>
                <option value="manual_verified_override">Manual Override</option>
              </select>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleSaveAsSkuTruth} disabled={isSavingSkuTruth} className="rounded bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
                {isSavingSkuTruth ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setSkuTruthDialog(null)} className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
