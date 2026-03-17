"use client";

import { useEffect, useMemo, useState } from "react";

type Model = { id: string; model_code: string; display_name: string };
type GarmentAsset = { id: string; public_url: string; asset_type: string };
type Garment = {
  id: string;
  garment_code: string;
  display_name: string;
  status: string;
  readiness_score?: number;
  readiness_status?: string;
  reference_summary?: { missing?: string[] };
  garment_assets?: GarmentAsset[];
};
type TryOnJob = {
  id: string;
  status: string;
  created_at: string;
  error_message?: string | null;
  garment_library?: { display_name: string; garment_code: string } | null;
  model_library?: { display_name: string; model_code: string } | null;
};

type TryOnResultMeta = {
  tryonJobId?: string;
  generationId?: string;
  warnings?: string[];
  readiness?: {
    readinessStatus?: string;
    readinessScore?: number;
    referenceSummary?: { missing?: string[] };
  };
  workflowProfile?: {
    workflowMode?: string;
    fidelityLevel?: string;
  };
  readinessGate?: {
    severity?: string;
    reasons?: string[];
    missingCritical?: string[];
  };
  selectedReferences?: {
    selectedAssetIds?: string[];
    primaryFrontAssetId?: string | null;
    primaryBackAssetId?: string | null;
    detailAssetIds?: string[];
    missingIdentityCriticalReferences?: string[];
  };
};

type SourceMode = "model_library" | "manual_upload";
type WorkflowMode = "standard_tryon" | "catalog_fidelity";
type FidelityLevel = "balanced" | "strict" | "hard_lock";
type PreferredOutputStyle = "catalog" | "studio" | "lifestyle";

const initialConstraints = {
  preserve_color: true,
  preserve_print: true,
  preserve_neckline: true,
  preserve_sleeve_shape: true,
  preserve_length: true,
  preserve_coverage: true,
  allow_pose_change: false,
  allow_background_change: false,
  allow_styling_variation: false,
  fit_mode: "balanced",
  composition_mode: "catalog",
};

export default function TryOnPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [jobs, setJobs] = useState<TryOnJob[]>([]);

  const [sourceMode, setSourceMode] = useState<SourceMode>("model_library");
  const [modelId, setModelId] = useState("");
  const [personAssetUrl, setPersonAssetUrl] = useState("");
  const [garmentId, setGarmentId] = useState("");

  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("catalog_fidelity");
  const [fidelityLevel, setFidelityLevel] = useState<FidelityLevel>("strict");
  const [preferredOutputStyle, setPreferredOutputStyle] = useState<PreferredOutputStyle>("catalog");

  const [backend, setBackend] = useState("imagen");
  const [engineMode] = useState("fidelity");
  const [aspectRatio] = useState<"1:1" | "16:9" | "9:16">("1:1");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [constraints, setConstraints] = useState(initialConstraints);

  const [submitting, setSubmitting] = useState(false);
  const [uploadingPerson, setUploadingPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [resultMeta, setResultMeta] = useState<TryOnResultMeta>({});
  const [reviewState] = useState({
    overall_rating: "usable",
    garment_fidelity_rating: "usable",
    subject_rating: "usable",
    pose_background_rating: "usable",
    issue_tags: "",
    review_notes: "",
  });

  const selectedGarment = useMemo(
    () => garments.find((item) => item.id === garmentId) ?? null,
    [garments, garmentId],
  );

  const hasValidSubject =
    sourceMode === "model_library" ? !!modelId : !!personAssetUrl;

  const canSubmit = !!garmentId && hasValidSubject && !submitting && !uploadingPerson;

  useEffect(() => {
    if (workflowMode === "catalog_fidelity") {
      setFidelityLevel((current) => (current === "balanced" ? "strict" : current));
      setPreferredOutputStyle((current) => (current === "lifestyle" ? "catalog" : current));
      setConstraints((current) => ({
        ...current,
        allow_pose_change: false,
        allow_background_change: false,
        allow_styling_variation: false,
        composition_mode: preferredOutputStyle === "studio" ? "studio" : "catalog",
      }));
    }
  }, [workflowMode, preferredOutputStyle]);

  async function loadAll() {
    const [modelsRes, garmentsRes, jobsRes] = await Promise.all([
      fetch("/api/models"),
      fetch("/api/garments"),
      fetch("/api/try-on"),
    ]);

    const [modelsJson, garmentsJson, jobsJson] = await Promise.all([
      modelsRes.json(),
      garmentsRes.json(),
      jobsRes.json(),
    ]);

    setModels(modelsJson.data ?? []);
    setGarments(garmentsJson.data ?? []);
    setJobs(jobsJson.data ?? []);
  }

  useEffect(() => {
    const timer = setTimeout(() => void loadAll(), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (sourceMode === "model_library") {
      setPersonAssetUrl("");
    } else {
      setModelId("");
    }
  }, [sourceMode]);

  async function uploadPerson(file: File | null) {
    if (!file) return;

    setError(null);
    setUploadingPerson(true);
    setPersonAssetUrl("");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.public_url) {
        setError(json.error ?? "Failed to upload subject image.");
        return;
      }

      setPersonAssetUrl(json.public_url);
      setSourceMode("manual_upload");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to upload subject image.");
    } finally {
      setUploadingPerson(false);
    }
  }

  async function submitTryOn() {
    if (!garmentId) {
      setError("Please select a garment.");
      return;
    }

    if (sourceMode === "model_library" && !modelId) {
      setError("Please select a model.");
      return;
    }

    if (sourceMode === "manual_upload" && !personAssetUrl) {
      setError("Please upload a person image.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResultUrl("");
    setResultMeta({});

    try {
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
          workflow_mode: workflowMode,
          fidelity_level: fidelityLevel,
          preferred_output_style: preferredOutputStyle,
          prompt,
          negative_prompt: negativePrompt,
          constraints,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Try-on failed.");
        return;
      }

      setResultUrl(json.data?.output_url ?? json.outputUrl ?? "");
      setResultMeta({
        tryonJobId: json.tryonJobId ?? json.data?.tryon_job_id,
        generationId: json.generationId ?? json.data?.generation_id,
        warnings: json.warnings ?? json.data?.warnings ?? [],
        readiness: json.readiness ?? json.data?.readiness,
        selectedReferences: json.selectedReferences ?? json.data?.selected_references,
        workflowProfile: json.workflowProfile ?? json.data?.workflow_profile,
        readinessGate: json.readinessGate ?? json.data?.readiness_gate,
      });

      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Try-on failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveReview() {
    if (!resultMeta.tryonJobId) return;

    try {
      const res = await fetch("/api/try-on/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tryon_job_id: resultMeta.tryonJobId,
          generation_id: resultMeta.generationId ?? null,
          overall_rating: reviewState.overall_rating,
          garment_fidelity_rating: reviewState.garment_fidelity_rating,
          subject_rating: reviewState.subject_rating,
          pose_background_rating: reviewState.pose_background_rating,
          issue_tags: reviewState.issue_tags
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          review_notes: reviewState.review_notes,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to save review.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save review.");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Try-On Studio (Beta)</h1>
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Beta workflow: results are directional and require QA before publication.
          </p>
        </header>

        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold">1. Subject</h2>

            {workflowMode === "catalog_fidelity" && (
              <p className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs text-sky-200">
                Best results come from neutral front-facing subject images with minimal styling.
              </p>
            )}

            <select
              value={sourceMode}
              onChange={(event) => setSourceMode(event.target.value as SourceMode)}
              className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"
            >
              <option value="model_library">Approved model</option>
              <option value="manual_upload">Manual upload</option>
            </select>

            {sourceMode === "model_library" ? (
              <select
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"
              >
                <option value="">Select model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.model_code} — {model.display_name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  value={personAssetUrl}
                  readOnly
                  placeholder="Uploaded person URL will appear here"
                  className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs text-zinc-400"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => uploadPerson(event.target.files?.[0] ?? null)}
                  className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"
                />
              </>
            )}
          </article>

          <article className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold">2. Garment</h2>

            <select
              value={garmentId}
              onChange={(event) => setGarmentId(event.target.value)}
              className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs"
            >
              <option value="">Select garment</option>
              {garments.map((garment) => (
                <option key={garment.id} value={garment.id}>
                  {garment.garment_code} — {garment.display_name}
                </option>
              ))}
            </select>

            {selectedGarment && (
              <div className="rounded border border-white/10 bg-zinc-950/60 p-2 text-xs">
                <p>
                  Readiness: {selectedGarment.readiness_status ?? "reference_incomplete"} (
                  {selectedGarment.readiness_score ?? 0})
                </p>
                {!!selectedGarment.reference_summary?.missing?.length && (
                  <p className="text-amber-300">
                    Missing identity-critical references: {selectedGarment.reference_summary.missing.join(", ")}
                  </p>
                )}
              </div>
            )}
          </article>

          <article className="space-y-2 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold">3. Controls</h2>
            <select value={workflowMode} onChange={(event) => setWorkflowMode(event.target.value as WorkflowMode)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs">
              <option value="standard_tryon">standard_tryon</option>
              <option value="catalog_fidelity">catalog_fidelity</option>
            </select>

            <select value={fidelityLevel} onChange={(event) => setFidelityLevel(event.target.value as FidelityLevel)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs">
              <option value="balanced">balanced</option>
              <option value="strict">strict</option>
              <option value="hard_lock">hard_lock</option>
            </select>

            <select value={preferredOutputStyle} onChange={(event) => setPreferredOutputStyle(event.target.value as PreferredOutputStyle)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs">
              <option value="catalog">catalog</option>
              <option value="studio">studio</option>
              <option value="lifestyle">lifestyle</option>
            </select>

            {workflowMode === "catalog_fidelity" && (
              <p className="rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-200">
                Catalog fidelity mode prioritizes garment identity over creative styling.
              </p>
            )}
            {workflowMode === "catalog_fidelity" && fidelityLevel !== "balanced" && preferredOutputStyle === "lifestyle" && (
              <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                Lifestyle styling may reduce exact garment fidelity in strict catalog mode.
              </p>
            )}

            <select value={backend} onChange={(event) => setBackend(event.target.value)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs">
              <option value="imagen">Imagen</option>
              <option value="nano-banana">Nano Banana</option>
            </select>

            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="scene prompt (optional)" className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" rows={2} />
            <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="negative prompt (optional)" className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" rows={2} />
          </article>
        </section>

        <section className="rounded-lg border border-white/10 bg-zinc-900/40 p-4">
          <h2 className="mb-2 text-sm font-semibold">Structured Constraints</h2>
          <button type="button" disabled={!canSubmit} onClick={submitTryOn} className="mt-1 rounded bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {uploadingPerson ? "Uploading subject..." : submitting ? "Submitting..." : "Submit try-on job"}
          </button>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="space-y-2 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="mb-2 text-sm font-semibold">4. Output</h2>

            {resultUrl ? <img src={resultUrl} alt="try-on result" className="max-h-96 w-full rounded object-cover" /> : <p className="text-xs text-zinc-400">No generated output yet.</p>}

            {!!resultMeta.warnings?.length && (
              <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                {resultMeta.warnings.join(" | ")}
              </p>
            )}

            <div className="rounded border border-white/10 bg-zinc-950/60 p-2 text-xs">
              <p>Workflow mode used: {resultMeta.workflowProfile?.workflowMode ?? "n/a"}</p>
              <p>Fidelity level used: {resultMeta.workflowProfile?.fidelityLevel ?? "n/a"}</p>
              <p>Readiness gate: {resultMeta.readinessGate?.severity ?? "n/a"}</p>
            </div>

            <details className="rounded border border-white/10 bg-zinc-950/60 p-2 text-xs">
              <summary>Forbidden transformations debug</summary>
              <p>{(resultMeta.selectedReferences?.missingIdentityCriticalReferences ?? []).join(", ") || "none"}</p>
              <p>{(resultMeta.readinessGate?.reasons ?? []).join(" | ") || "No gate warnings."}</p>
            </details>

            {resultMeta.tryonJobId && (
              <button type="button" onClick={saveReview} className="rounded border border-white/20 px-2 py-1 text-xs">
                Save review
              </button>
            )}
          </article>

          <article className="rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="mb-2 text-sm font-semibold">Latest Jobs</h2>
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded border border-white/10 bg-zinc-950/60 p-2 text-xs">
                  <p>
                    {job.garment_library?.display_name ?? "Garment"} · {job.model_library?.display_name ?? "Manual subject"}
                  </p>
                  <p className="text-zinc-400">{job.status} · {new Date(job.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
