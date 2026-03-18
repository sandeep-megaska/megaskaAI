"use client";

import { useEffect, useMemo, useState } from "react";

type Model = { id: string; model_code: string; display_name: string };
type Garment = { id: string; garment_code: string; display_name: string };
type AIBackend = { id: string; name: string; type: "image" | "video"; model: string };

type ContactSheetItem = {
  shotKey: string;
  title: string;
  outputUrl: string;
  generationId: string;
  shotOrder: number;
};

const CATALOG_SHOT_PACK = [
  { shotKey: "front_full", title: "Front Full" },
  { shotKey: "back_full", title: "Back Full" },
  { shotKey: "side_right", title: "Side Right" },
  { shotKey: "three_quarter_angle", title: "3/4 Angle" },
  { shotKey: "detail_upper", title: "Detail Upper" },
  { shotKey: "lifestyle_studio", title: "Lifestyle Studio" },
];

const LIFESTYLE_SHOT_PACK = [
  { shotKey: "poolside_standing", title: "Poolside Standing" },
  { shotKey: "resort_walk", title: "Resort Walk" },
  { shotKey: "seated_lounge", title: "Seated Lounge" },
  { shotKey: "studio_shadow", title: "Studio Shadow" },
  { shotKey: "sunlit_terrace", title: "Sunlit Terrace" },
  { shotKey: "close_fashion", title: "Close Fashion" },
];

const LIFESTYLE_THEMES = [
  { key: "luxury_poolside", label: "Luxury Poolside" },
  { key: "resort_editorial", label: "Resort Editorial" },
  { key: "premium_studio_lifestyle", label: "Premium Studio Lifestyle" },
  { key: "tropical_escape", label: "Tropical Escape" },
  { key: "minimal_neutral_editorial", label: "Minimal Neutral Editorial" },
  { key: "sunlit_terrace", label: "Sunlit Terrace" },
  { key: "modern_indoor_luxury", label: "Modern Indoor Luxury" },
] as const;

function getBackendFamily(model: string): "gemini-image" | "imagen" | "veo" | "unknown" {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith("gemini-") && normalized.includes("image")) return "gemini-image";
  if (normalized.startsWith("imagen-")) return "imagen";
  if (normalized.startsWith("veo-")) return "veo";
  return "unknown";
}

function getLookbookBackendDisabledReason(backend: AIBackend): string | null {
  const family = getBackendFamily(backend.model);
  if (family === "gemini-image") return null;
  if (family === "imagen") return "Imagen not allowed";
  if (family === "veo") return "Veo not allowed";
  return "Unsupported backend";
}

export default function LookbookPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [backends, setBackends] = useState<AIBackend[]>([]);

  const [modelId, setModelId] = useState("");
  const [garmentId, setGarmentId] = useState("");
  const [backendId, setBackendId] = useState("");
  const [outputGoal, setOutputGoal] = useState<"catalog" | "lifestyle">("catalog");
  const [themeKey, setThemeKey] = useState<string>(LIFESTYLE_THEMES[0].key);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookbookJobId, setLookbookJobId] = useState<string>("");
  const [contactSheet, setContactSheet] = useState<ContactSheetItem[]>([]);

  const enabledBackends = useMemo(
    () => backends.filter((backend) => backend.type === "image" && !getLookbookBackendDisabledReason(backend)),
    [backends],
  );

  useEffect(() => {
    if (enabledBackends.length && !enabledBackends.some((backend) => backend.id === backendId)) {
      setBackendId(enabledBackends[0].id);
    }
  }, [enabledBackends, backendId]);

  useEffect(() => {
    async function loadAll() {
      const [modelsRes, garmentsRes, backendsRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/garments"),
        fetch("/api/ai/backends"),
      ]);

      const [modelsJson, garmentsJson, backendsJson] = await Promise.all([
        modelsRes.json(),
        garmentsRes.json(),
        backendsRes.json(),
      ]);

      setModels(modelsJson.data ?? []);
      setGarments(garmentsJson.data ?? []);
      setBackends(backendsJson.data ?? []);
    }

    loadAll();
  }, []);

  async function generateLookbook() {
    if (!modelId || !garmentId || !backendId) {
      setError("Select model identity, garment identity, and Gemini backend.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setLookbookJobId("");

    try {
      const res = await fetch("/api/lookbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: modelId,
          garment_id: garmentId,
          backend: backendId,
          job_variant: outputGoal,
          mode: outputGoal,
          output_style: outputGoal === "lifestyle" ? "lifestyle" : "catalog",
          theme_key: outputGoal === "lifestyle" ? themeKey : null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Failed to generate lookbook.");
        return;
      }

      setLookbookJobId(json.lookbookJobId ?? "");
      setContactSheet((json.shots ?? []).sort((a: ContactSheetItem, b: ContactSheetItem) => a.shotOrder - b.shotOrder));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to generate lookbook.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-xl border border-white/10 bg-zinc-900/50 p-6">
          <h1 className="text-2xl font-semibold">Consistent Lookbook</h1>
          <p className="mt-2 text-sm text-zinc-400">Generate a 6-shot output with locked model + garment identity in either Catalog Lookbook or Lifestyle Photoshoot mode.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Model identity pack</span>
              <select value={modelId} onChange={(event) => setModelId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
                <option value="">Select model identity</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.model_code} — {model.display_name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Garment identity pack</span>
              <select value={garmentId} onChange={(event) => setGarmentId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
                <option value="">Select garment identity</option>
                {garments.map((garment) => (
                  <option key={garment.id} value={garment.id}>{garment.garment_code} — {garment.display_name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Backend selector (Gemini only)</span>
              <select value={backendId} onChange={(event) => setBackendId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
                {backends
                  .filter((backend) => backend.type === "image")
                  .map((backend) => {
                    const disabledReason = getLookbookBackendDisabledReason(backend);
                    return (
                      <option key={backend.id} value={backend.id} disabled={Boolean(disabledReason)}>
                        {backend.name}{disabledReason ? ` — ${disabledReason}` : ""}
                      </option>
                    );
                  })}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-zinc-300">Output Goal</span>
              <select value={outputGoal} onChange={(event) => setOutputGoal(event.target.value as "catalog" | "lifestyle")} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
                <option value="catalog">Catalog Lookbook</option>
                <option value="lifestyle">Lifestyle Photoshoot</option>
              </select>
            </label>

            {outputGoal === "lifestyle" && (
              <label className="space-y-1 text-sm">
                <span className="text-zinc-300">Theme</span>
                <select value={themeKey} onChange={(event) => setThemeKey(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-2">
                  {LIFESTYLE_THEMES.map((theme) => (
                    <option key={theme.key} value={theme.key}>{theme.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-white/10 bg-zinc-950/60 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              {outputGoal === "catalog" ? "Catalog shot preview" : "Lifestyle photoshoot preview"}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {outputGoal === "catalog"
                ? "Technical product-forward framing for ecommerce and line-sheet consistency."
                : "Scene-driven premium editorial set with varied backgrounds, poses, and lighting mood."}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(outputGoal === "catalog" ? CATALOG_SHOT_PACK : LIFESTYLE_SHOT_PACK).map((shot) => (
                <div key={shot.shotKey} className="rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300">
                  {shot.title}
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={generateLookbook} disabled={submitting || !modelId || !garmentId || !backendId} className="mt-6 rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Generating lookbook..." : outputGoal === "catalog" ? "Generate Catalog Lookbook" : "Generate Lifestyle Photoshoot"}
          </button>

          {error && <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {lookbookJobId && <p className="mt-4 text-xs text-zinc-400">Lookbook Job: {lookbookJobId}</p>}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Results Contact Sheet</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contactSheet.map((item) => (
              <article key={`${item.generationId}-${item.shotKey}`} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60">
                <div className="aspect-square bg-zinc-900">
                  <img src={item.outputUrl} alt={item.title} className="h-full w-full object-cover" />
                </div>
                <div className="space-y-1 p-3">
                  <p className="text-sm font-semibold text-zinc-200">{item.title}</p>
                  <p className="text-xs text-zinc-400">{item.shotKey}</p>
                </div>
              </article>
            ))}
            {!contactSheet.length && <p className="text-sm text-zinc-400">No lookbook generated yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
