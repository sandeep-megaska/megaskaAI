"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Download, Sparkles } from "lucide-react";
import { isGeminiImageModel } from "@/lib/ai/backendFamilies";
import { buildMasterCandidatePrompt, buildMoreViewsPrompt, type StudioWorkflowMode } from "@/lib/studio/prompts";

type AspectRatio = "1:1" | "16:9" | "9:16";
type AIBackend = { id: string; name: string; type: "image" | "video"; model: string };

type GenerationItem = {
  id: string;
  prompt: string;
  aspect_ratio: AspectRatio;
  asset_url?: string;
  url?: string;
  overlay_json?: Record<string, unknown> | null;
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

const aspectRatios: AspectRatio[] = ["1:1", "16:9", "9:16"];
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

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [backendId, setBackendId] = useState("");
  const [workflowMode, setWorkflowMode] = useState<StudioWorkflowMode>("master-candidates");
  const [garmentReferenceUrls, setGarmentReferenceUrls] = useState<string[]>([]);
  const [modelReferenceUrls, setModelReferenceUrls] = useState<string[]>([]);
  const [outputCount, setOutputCount] = useState<number>(4);
  const [isGenerating, setIsGenerating] = useState(false);
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

  const loadGallery = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("generations").select("id,prompt,aspect_ratio,asset_url,url,overlay_json").order("created_at", { ascending: false }).limit(12);
    setGalleryItems((data ?? []) as GenerationItem[]);
  }, [supabase]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    async function loadOptions() {
      const backendsRes = await fetch("/api/ai/backends");
      const backendJson = await backendsRes.json();
      setBackends(backendJson.data ?? []);
    }
    loadOptions();
  }, []);

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

      return {
        prompt: wrappedPrompt,
        referenceUrls,
        referenceKindsUsed: [
          ...(modelReferenceUrls.length ? ["model"] : []),
          ...(garmentReferenceUrls.length ? ["garment"] : []),
        ],
        masterGenerationId: null,
      };
    }

    const wrappedPrompt = buildMoreViewsPrompt({ userPrompt: prompt });
    const referenceUrls = [
      ...(masterState.selectedMasterUrl ? [masterState.selectedMasterUrl] : []),
      ...garmentReferenceUrls,
      ...modelReferenceUrls,
    ];

    return {
      prompt: wrappedPrompt,
      referenceUrls,
      referenceKindsUsed: [
        ...(masterState.selectedMasterUrl ? ["master"] : []),
        ...(garmentReferenceUrls.length ? ["garment"] : []),
        ...(modelReferenceUrls.length ? ["model"] : []),
      ],
      masterGenerationId: masterState.selectedMasterGenerationId,
    };
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
      await loadGallery();
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

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 space-y-6">
          <div className="space-y-2">
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
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={workflowMode === "master-candidates" ? "Premium front-view swimwear campaign shot..." : "Back view, side angle, detail shot, poolside luxury..."}
              className="h-28 w-full rounded-lg border border-white/10 bg-zinc-950/70 p-3 text-sm md:col-span-2"
            />
            <input type="file" accept="image/*" multiple onChange={(event) => uploadFiles(event.target.files, "garment")} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
            <input type="file" accept="image/*" multiple onChange={(event) => uploadFiles(event.target.files, "model")} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatio)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm">
              {aspectRatios.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
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
                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-2 text-xs">
                      <Download className="h-3.5 w-3.5" />Download
                    </a>
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
                  <div className="space-y-1 p-4">
                    <p className="line-clamp-2 text-sm text-zinc-200">{item.prompt}</p>
                    <p className="text-xs text-zinc-400">
                      {String(workflow ?? "legacy")}
                      {galleryMasterGenerationId && selectedMasterId === galleryMasterGenerationId ? " · Derived from current master" : ""}
                    </p>
                    <div className="pt-1">
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
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
