"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Copy, Download, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type MediaType = "Image" | "Video";
type AspectRatio = "1:1" | "16:9" | "9:16";
type OverlayPosition = "top" | "center" | "bottom";
type OverlayTheme = "megaska-light" | "megaska-dark";

type ModelLibrary = { id: string; display_name: string; model_code: string };
type BrandPreset = {
  id: string;
  name: string;
  aspect_ratio?: AspectRatio;
  overlay_defaults?: { headline?: string; subtext?: string; cta?: string; position?: OverlayPosition; theme?: OverlayTheme };
};
type AIBackend = { id: string; name: string; type: "image" | "video"; model: string };
type CreditSummary = { balance: number; currency: string; last_updated: string };

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
  overlay_json?: { headline?: string; subtext?: string; cta?: string; position?: OverlayPosition; theme?: OverlayTheme } | null;
  reference_urls?: string[] | null;
};

const mediaTypes: MediaType[] = ["Image", "Video"];
const aspectRatios: AspectRatio[] = ["1:1", "16:9", "9:16"];

export default function Home() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("Image");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [modelId, setModelId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [backendId, setBackendId] = useState("");
  const [headline, setHeadline] = useState("");
  const [subtext, setSubtext] = useState("");
  const [cta, setCta] = useState("");
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>("bottom");
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>("megaska-light");
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GenerationItem[]>([]);
  const [galleryState, setGalleryState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelLibrary[]>([]);
  const [presets, setPresets] = useState<BrandPreset[]>([]);
  const [backends, setBackends] = useState<AIBackend[]>([]);
  const [credits, setCredits] = useState<CreditSummary | null>(null);

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const availableBackends = useMemo(
    () => backends.filter((backend) => backend.type === (mediaType === "Image" ? "image" : "video")),
    [backends, mediaType],
  );

  useEffect(() => {
    if (availableBackends.length && !availableBackends.some((backend) => backend.id === backendId)) {
      setBackendId(availableBackends[0].id);
    }
  }, [availableBackends, backendId]);

  const loadGallery = useCallback(async () => {
    if (!supabase) return;
    setGalleryState("loading");
    const { data, error } = await supabase.from("generations").select("*").order("created_at", { ascending: false }).limit(12);
    if (error) return setGalleryState("error");
    setGalleryItems((data ?? []) as GenerationItem[]);
    setGalleryState("idle");
  }, [supabase]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    async function loadOptions() {
      const [modelsRes, presetsRes, backendsRes, creditsRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/presets"),
        fetch("/api/ai/backends"),
        fetch("/api/credits"),
      ]);
      const modelJson = await modelsRes.json();
      const presetJson = await presetsRes.json();
      const backendJson = await backendsRes.json();
      const creditJson = await creditsRes.json();
      setModels(modelJson.data ?? []);
      setPresets(presetJson.data ?? []);
      setBackends(backendJson.data ?? []);
      setCredits(creditJson.data ?? null);
    }

    loadOptions();
  }, []);

  async function uploadReferenceFiles(files: FileList | null) {
    if (!files?.length) return;
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok && json.public_url) uploaded.push(json.public_url);
    }
    if (uploaded.length) setReferenceUrls((current) => [...current, ...uploaded]);
  }

  async function handleGenerate() {
    if (!prompt.trim() || isGenerating) return;

    try {
      setIsGenerating(true);
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
          ai_backend_id: backendId || null,
          overlay: { headline, subtext, cta, position: overlayPosition, theme: overlayTheme },
          reference_urls: referenceUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Generation failed");
      await loadGallery();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
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
    setOverlayTheme(item.overlay_json?.theme ?? "megaska-light");
    setReferenceUrls(item.reference_urls ?? []);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
       {/* HEADER */}
<header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111f]/85 backdrop-blur-xl">
  <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
    
    {/* LEFT: LOGO + NAV */}
    <div className="flex min-w-0 items-center gap-4">
      
      {/* LOGO */}
      <Link href="/logo_megaska.png" className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 shadow-[0_8px_30px_rgba(34,211,238,0.12)]">
          <span className="text-sm font-semibold tracking-[0.18em] text-cyan-300">
            M
          </span>
        </div>

        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-wide text-white sm:text-lg">
            Megaska AI
          </div>
          <div className="truncate text-xs text-slate-400 sm:text-sm">
            The Creative Studio
          </div>
        </div>
      </Link>

      {/* DESKTOP NAV */}
      <nav className="hidden items-center gap-2 pl-4 md:flex">
        {[
          { href: "/", label: "Studio" },
          { href: "/models", label: "Models" },
          { href: "/garments", label: "Garments" },
          { href: "/try-on", label: "Try-On" },
        ].map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/25"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>

    {/* RIGHT: CREDITS */}
    <div className="flex items-center gap-3">
      <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-2 sm:block">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
          Credits
        </div>
       <div className="text-sm font-semibold text-white">
  {credits?.balance ?? 0}
</div>
      </div>
    </div>
  </div>

  {/* MOBILE NAV */}
  <div className="border-t border-white/5 px-4 py-2 md:hidden">
    <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
      {[
        { href: "/", label: "Studio" },
        { href: "/models", label: "Models" },
        { href: "/garments", label: "Garments" },
        { href: "/try-on", label: "Try-On" },
      ].map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
              isActive
                ? "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/25"
                : "bg-white/5 text-slate-300 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  </div>
</header>

        <section className="grid gap-6 rounded-xl border border-white/10 bg-zinc-900/50 p-6 lg:grid-cols-2">
          <div className="space-y-3">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe your creative request..." className="h-32 w-full rounded-lg border border-white/10 bg-zinc-950/70 p-3 text-sm" />
            <div className="grid gap-3 md:grid-cols-2">
              <select value={modelId} onChange={(event) => setModelId(event.target.value)} className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm"><option value="">Model Library (optional)</option>{models.map((model) => <option key={model.id} value={model.id}>{`${model.model_code} — ${model.display_name}`}</option>)}</select>
              <select value={presetId} onChange={(event) => setPresetId(event.target.value)} className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm"><option value="">Preset (optional)</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Headline" className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
              <input value={subtext} onChange={(event) => setSubtext(event.target.value)} placeholder="Subtext" className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
              <input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="CTA" className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
              <select value={overlayPosition} onChange={(event) => setOverlayPosition(event.target.value as OverlayPosition)} className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm"><option value="top">Overlay Top</option><option value="center">Overlay Center</option><option value="bottom">Overlay Bottom</option></select>
              <select value={overlayTheme} onChange={(event) => setOverlayTheme(event.target.value as OverlayTheme)} className="rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm"><option value="megaska-light">Theme: Megaska Light</option><option value="megaska-dark">Theme: Megaska Dark</option></select>
            </div>
            <input type="file" accept="image/*" multiple onChange={(event) => uploadReferenceFiles(event.target.files)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm" />
            {!!referenceUrls.length && <p className="text-xs text-zinc-400">Uploaded references: {referenceUrls.length}</p>}
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-300">Output Type</p>
              <div className="inline-flex rounded-lg border border-white/10 bg-zinc-950/70 p-1">{mediaTypes.map((type) => <button key={type} type="button" onClick={() => setMediaType(type)} className={`rounded-md px-4 py-2 text-sm ${mediaType === type ? "bg-indigo-500 text-white" : "text-zinc-300"}`}>{type}</button>)}</div>
            </div>
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatio)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm">{aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</select>
            <select value={backendId} onChange={(event) => setBackendId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm">
              {availableBackends.map((backend) => <option key={backend.id} value={backend.id}>{backend.name}</option>)}
            </select>
            <button type="button" onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Sparkles className="h-4 w-4" />{isGenerating ? "Generating..." : "Generate"}</button>
            {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Gallery</h2>
          {galleryState === "loading" && <p className="text-sm text-zinc-400">Loading brand assets...</p>}
          {galleryState === "error" && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">Unable to fetch gallery results right now.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryItems.map((item) => {
              const type = item.media_type || item.type;
              const src = item.asset_url || item.url;
              const modelName = models.find((model) => model.id === item.model_id)?.display_name;
              const presetName = presets.find((preset) => preset.id === item.preset_id)?.name;
              return (
                <article key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60">
                  <div className="aspect-video overflow-hidden bg-zinc-900">{src ? (type === "Video" ? <video src={src} controls className="h-full w-full object-cover" /> : <img src={src} alt={item.prompt} className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-sm text-zinc-500">No preview</div>}</div>
                  <div className="space-y-3 p-4">
                    <p className="line-clamp-2 text-sm text-zinc-200">{item.prompt}</p>
                    <p className="text-xs text-zinc-400">{modelName ? `Model: ${modelName}` : "Model: none"} · {presetName ? `Preset: ${presetName}` : "Preset: none"}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => applyGalleryItem(item)} className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs"><Copy className="h-4 w-4" />Reuse</button>
                      <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs"><Download className="h-4 w-4" />Download</a>
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
