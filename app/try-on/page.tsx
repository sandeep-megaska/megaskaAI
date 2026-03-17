"use client";

import { useEffect, useMemo, useState } from "react";

type Model = { id: string; model_code: string; display_name: string };
type GarmentAsset = { id: string; public_url: string; asset_type: string };
type Garment = { id: string; garment_code: string; display_name: string; status: string; garment_assets?: GarmentAsset[] };
type TryOnJob = {
  id: string;
  status: string;
  created_at: string;
  error_message?: string | null;
  garment_library?: { display_name: string; garment_code: string } | null;
  model_library?: { display_name: string; model_code: string } | null;
};

const initialConstraints = {
  preserve_color: true,
  preserve_print: true,
  preserve_neckline: true,
  preserve_sleeve_shape: true,
  preserve_length: true,
  preserve_coverage: true,
  allow_pose_change: true,
  allow_background_change: true,
  allow_styling_variation: false,
  fit_mode: "balanced",
  composition_mode: "studio",
};

export default function TryOnPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [jobs, setJobs] = useState<TryOnJob[]>([]);
  const [sourceMode, setSourceMode] = useState<"model_library" | "manual_upload">("model_library");
  const [modelId, setModelId] = useState("");
  const [personAssetUrl, setPersonAssetUrl] = useState("");
  const [garmentId, setGarmentId] = useState("");
  const [backend, setBackend] = useState("imagen");
  const [engineMode, setEngineMode] = useState("fidelity");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16">("1:1");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [constraints, setConstraints] = useState(initialConstraints);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string>("");

  const selectedGarment = useMemo(() => garments.find((item) => item.id === garmentId) ?? null, [garments, garmentId]);

  async function loadAll() {
    const [modelsRes, garmentsRes, jobsRes] = await Promise.all([
      fetch("/api/models"),
      fetch("/api/garments"),
      fetch("/api/try-on"),
    ]);

    const [modelsJson, garmentsJson, jobsJson] = await Promise.all([modelsRes.json(), garmentsRes.json(), jobsRes.json()]);
    setModels(modelsJson.data ?? []);
    setGarments(garmentsJson.data ?? []);
    setJobs(jobsJson.data ?? []);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  async function uploadPerson(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const json = await res.json();
    if (res.ok && json.public_url) {
      setPersonAssetUrl(json.public_url);
      setSourceMode("manual_upload");
    }
  }

  async function submitTryOn() {
    setSubmitting(true);
    setError(null);
    setResultUrl("");

    const res = await fetch("/api/try-on", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_id: sourceMode === "model_library" ? modelId || null : null,
        person_asset_url: sourceMode === "manual_upload" ? personAssetUrl || null : null,
        garment_id: garmentId,
        backend,
        engine_mode: engineMode,
        aspect_ratio: aspectRatio,
        prompt,
        negative_prompt: negativePrompt,
        constraints,
      }),
    });

    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Try-on failed.");
    if (res.ok) {
      setResultUrl(json.data?.output_url ?? "");
      await loadAll();
    }

    setSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Try-On Studio (Beta)</h1>
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Beta workflow: results are directional and require QA before publication.</p>
        </header>

        {error && <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold">1. Subject</h2>
            <select value={sourceMode} onChange={(event) => setSourceMode(event.target.value as "model_library" | "manual_upload")} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"><option value="model_library">Approved model</option><option value="manual_upload">Manual upload</option></select>
            {sourceMode === "model_library" ? (
              <select value={modelId} onChange={(event) => setModelId(event.target.value)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"><option value="">Select model</option>{models.map((model) => <option key={model.id} value={model.id}>{model.model_code} — {model.display_name}</option>)}</select>
            ) : (
              <>
                <input value={personAssetUrl} onChange={(event) => setPersonAssetUrl(event.target.value)} placeholder="Uploaded person URL" className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" />
                <input type="file" accept="image/*" onChange={(event) => uploadPerson(event.target.files?.[0] ?? null)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" />
              </>
            )}
          </article>

          <article className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold">2. Garment</h2>
            <select value={garmentId} onChange={(event) => setGarmentId(event.target.value)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"><option value="">Select garment</option>{garments.map((garment) => <option key={garment.id} value={garment.id}>{garment.garment_code} — {garment.display_name}</option>)}</select>
            <div className="grid grid-cols-3 gap-2">
              {(selectedGarment?.garment_assets ?? []).slice(0, 6).map((asset) => (
                <img key={asset.id} src={asset.public_url} alt={asset.asset_type} className="h-20 w-full rounded object-cover" />
              ))}
            </div>
          </article>

          <article className="space-y-2 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold">3. Controls</h2>
            <select value={backend} onChange={(event) => setBackend(event.target.value)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"><option value="imagen">Imagen</option><option value="nano-banana">Nano Banana</option></select>
            <select value={engineMode} onChange={(event) => setEngineMode(event.target.value)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"><option value="fidelity">fidelity</option><option value="creative">creative</option></select>
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as "1:1" | "16:9" | "9:16")} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option></select>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="scene prompt (optional)" className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" rows={2} />
            <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="negative prompt (optional)" className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" rows={2} />
          </article>
        </section>

        <section className="rounded-lg border border-white/10 bg-zinc-900/40 p-4">
          <h2 className="mb-2 text-sm font-semibold">Structured Constraints</h2>
          <div className="grid gap-2 md:grid-cols-3">
            {Object.entries(constraints).map(([key, value]) => typeof value === "boolean" ? (
              <label key={key} className="flex items-center justify-between rounded border border-white/10 bg-zinc-950/70 px-2 py-1 text-xs">
                <span>{key}</span>
                <input type="checkbox" checked={value} onChange={(event) => setConstraints((current) => ({ ...current, [key]: event.target.checked }))} />
              </label>
            ) : (
              <label key={key} className="space-y-1 text-xs">
                <span>{key}</span>
                <input value={String(value)} onChange={(event) => setConstraints((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded border border-white/10 bg-zinc-950 p-1" />
              </label>
            ))}
          </div>
          <button type="button" disabled={submitting} onClick={submitTryOn} className="mt-3 rounded bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Submitting..." : "Submit try-on job"}</button>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="mb-2 text-sm font-semibold">4. Output</h2>
            {resultUrl ? <img src={resultUrl} alt="try-on result" className="max-h-96 w-full rounded object-cover" /> : <p className="text-xs text-zinc-400">No generated output yet.</p>}
          </article>
          <article className="rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="mb-2 text-sm font-semibold">Latest Jobs</h2>
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded border border-white/10 bg-zinc-950/60 p-2 text-xs">
                  <p>{job.garment_library?.display_name ?? "Garment"} · {job.model_library?.display_name ?? "Manual subject"}</p>
                  <p className="text-zinc-400">{job.status} · {new Date(job.created_at).toLocaleString()}</p>
                  {job.error_message && <p className="text-rose-300">{job.error_message}</p>}
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
