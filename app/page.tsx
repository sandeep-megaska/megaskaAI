"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Copy, Download, Sparkles } from "lucide-react";

type MediaType = "Image" | "Video";
type AspectRatio = "1:1" | "16:9" | "9:16";
type OverlayPosition = "top" | "center" | "bottom";

type ModelLibrary = {
  id: string;
  display_name: string;
  model_code: string;
};

type BrandPreset = {
  id: string;
  name: string;
  aspect_ratio?: AspectRatio;
  overlay_defaults?: { headline?: string; subtext?: string; cta?: string; position?: OverlayPosition };
};

type GenerationItem = {
  id: string;
  prompt: string;
  media_type?: MediaType;
  type?: MediaType;
  aspect_ratio: AspectRatio;
  asset_url?: string;
  url?: string;
  model_id?: string | null;
  preset_id?: string | null;
  overlay_json?: { headline?: string; subtext?: string; cta?: string; position?: OverlayPosition } | null;
  reference_urls?: string[] | null;
  created_at: string;
};

const mediaTypes: MediaType[] = ["Image", "Video"];
const aspectRatios: AspectRatio[] = ["1:1", "16:9", "9:16"];
const loadingMessages = [
  "Veo is crafting your cinematography...",
  "Refining composition and brand-safe tones...",
  "Polishing final frames for launch-ready content...",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("Image");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [modelId, setModelId] = useState<string>("");
  const [presetId, setPresetId] = useState<string>("");
  const [headline, setHeadline] = useState("");
  const [subtext, setSubtext] = useState("");
  const [cta, setCta] = useState("");
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>("bottom");
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [galleryItems, setGalleryItems] = useState<GenerationItem[]>([]);
  const [galleryState, setGalleryState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelLibrary[]>([]);
  const [presets, setPresets] = useState<BrandPreset[]>([]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, [supabaseAnonKey, supabaseUrl]);

  const loadGallery = useCallback(async () => {
    if (!supabase) return;
    setGalleryState("loading");
    const { data, error } = await supabase.from("generations").select("*").order("created_at", { ascending: false }).limit(12);

    if (error) {
      setGalleryState("error");
      return;
    }
    setGalleryItems((data ?? []) as GenerationItem[]);
    setGalleryState("idle");
  }, [supabase]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    async function loadOptions() {
      const [modelsRes, presetsRes] = await Promise.all([fetch("/api/models"), fetch("/api/presets")]);
      const modelJson = await modelsRes.json();
      const presetJson = await presetsRes.json();
      setModels(modelJson.data ?? []);
      setPresets(presetJson.data ?? []);
    }

    loadOptions();
  }, []);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = window.setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % loadingMessages.length);
    }, 1400);
    return () => window.clearInterval(interval);
  }, [isGenerating]);

  async function uploadReferenceFiles(files: FileList | null) {
    if (!files?.length) return;
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok && json.public_url) {
        uploaded.push(json.public_url);
      }
    }
    if (uploaded.length) setReferenceUrls((current) => [...current, ...uploaded]);
  }

  function applyGalleryItem(item: GenerationItem) {
    setPrompt(item.prompt);
    setAspectRatio(item.aspect_ratio);
    setMediaType((item.media_type || item.type || "Image") as MediaType);
    setModelId(item.model_id ?? "");
    setPresetId(item.preset_id ?? "");
    setHeadline(item.overlay_json?.headline ?? "");
    setSubtext(item.overlay_json?.subtext ?? "");
    setCta(item.overlay_json?.cta ?? "");
    setOverlayPosition(item.overlay_json?.position ?? "bottom");
    setReferenceUrls(item.reference_urls ?? []);
  }

  async function handleGenerate() {
    if (!prompt.trim() || isGenerating) return;

    try {
      setIsGenerating(true);
      setLoadingMessageIndex(0);
      setError(null);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: mediaType === "Image" ? "image" : "video",
          prompt,
          aspect_ratio: aspectRatio,
          model_id: modelId || null,
          preset_id: presetId || null,
          overlay: { headline, subtext, cta, position: overlayPosition },
          reference_urls: referenceUrls,
        }),
      });

      const text = await res.text();
      let data: { success?: boolean; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response: ${text}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Generation failed");
      }

      await loadGallery();
    } catch (err) {
      console.error("Frontend generate error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] px-6 py-10 text-zinc-100 md:px-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-400">Creative Suite</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Brand Content Lab</h1>
          <p className="max-w-2xl text-sm text-zinc-400 md:text-base">Generate premium, campaign-ready visuals with consistent brand storytelling.</p>
        </header>

        <section className="grid gap-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-2xl shadow-black/30 md:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <label htmlFor="prompt" className="block text-sm font-medium text-zinc-300">Prompt Input</label>
            <textarea id="prompt" className="min-h-32 w-full resize-none rounded-xl border border-white/10 bg-zinc-950/60 p-4 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/70" placeholder="Describe your brand concept, tone, setting, and visual style..." value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
              <select value={modelId} onChange={(event) => setModelId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100">
                <option value="">No model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.display_name}</option>
                ))}
              </select>
              <select value={presetId} onChange={(event) => {
                const id = event.target.value;
                setPresetId(id);
                const preset = presets.find((entry) => entry.id === id);
                if (preset?.aspect_ratio) setAspectRatio(preset.aspect_ratio);
                if (preset?.overlay_defaults) {
                  setHeadline(preset.overlay_defaults.headline ?? "");
                  setSubtext(preset.overlay_defaults.subtext ?? "");
                  setCta(preset.overlay_defaults.cta ?? "");
                  setOverlayPosition(preset.overlay_defaults.position ?? "bottom");
                }
              }} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100">
                <option value="">No preset</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Headline" className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
              <input value={subtext} onChange={(event) => setSubtext(event.target.value)} placeholder="Subtext" className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
              <input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="CTA" className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
              <select value={overlayPosition} onChange={(event) => setOverlayPosition(event.target.value as OverlayPosition)} className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm">
                <option value="top">Overlay Top</option>
                <option value="center">Overlay Center</option>
                <option value="bottom">Overlay Bottom</option>
              </select>
            </div>
            <input type="file" accept="image/*" multiple onChange={(event) => uploadReferenceFiles(event.target.files)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
            {!!referenceUrls.length && <p className="text-xs text-zinc-400">Uploaded references: {referenceUrls.length}</p>}
          </div>

          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">Output Type</p>
                <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950/70 p-1">
                  {mediaTypes.map((type) => (
                    <button key={type} type="button" onClick={() => setMediaType(type)} className={`rounded-md px-4 py-2 text-sm transition ${mediaType === type ? "bg-indigo-500 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}>{type}</button>
                  ))}
                </div>
              </div>
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatio)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100">
                {aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </div>

            <button type="button" onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles className="h-4 w-4" />
              {isGenerating ? loadingMessages[loadingMessageIndex] : "Generate"}
            </button>
            {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Gallery</h2></div>
          {!supabase && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to load gallery results from Supabase.</p>}
          {galleryState === "loading" && <p className="text-sm text-zinc-400">Loading brand assets...</p>}
          {galleryState === "error" && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">Unable to fetch gallery results right now.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryItems.map((item) => {
              const type = item.media_type || item.type;
              const src = item.asset_url || item.url;
              const modelName = models.find((model) => model.id === item.model_id)?.display_name;
              const presetName = presets.find((preset) => preset.id === item.preset_id)?.name;

              return (
                <article key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60 backdrop-blur">
                  <div className="aspect-video overflow-hidden bg-zinc-900">
                    {src ? (type === "Video" ? <video src={src} controls className="h-full w-full object-cover" /> : <img src={src} alt={item.prompt} className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-sm text-zinc-500">No preview</div>}
                  </div>
                  <div className="space-y-3 p-4">
                    <p className="line-clamp-2 text-sm text-zinc-200">{item.prompt}</p>
                    <div className="flex items-center justify-between text-xs text-zinc-400"><span>{type}</span><span>{item.aspect_ratio}</span></div>
                    <p className="text-xs text-zinc-400">{modelName ? `Model: ${modelName}` : "Model: none"} · {presetName ? `Preset: ${presetName}` : "Preset: none"}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => applyGalleryItem(item)} className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/5"><Copy className="h-4 w-4" />Reuse</button>
                      <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/5"><Download className="h-4 w-4" />Download</a>
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
