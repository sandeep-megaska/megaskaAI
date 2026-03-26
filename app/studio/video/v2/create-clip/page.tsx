"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { PHASE1_TEMPLATES, type Phase1TemplateId } from "@/lib/video/v2/templateMode";

type GalleryImage = { id: string; prompt: string | null; asset_url: string | null; url: string | null };
type SourceProfile = { id: string; profile_name: string; primary_generation_id: string; created_at: string };

export default function CreateClipPage() {
  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [profiles, setProfiles] = useState<SourceProfile[]>([]);
  const [selectedGenerationId, setSelectedGenerationId] = useState("");
  const [profileName, setProfileName] = useState("New source profile");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [intentLabel, setIntentLabel] = useState("Create hero product clip");
  const [motionPrompt, setMotionPrompt] = useState("Subtle body sway with garment fidelity lock.");
  const [productionMode, setProductionMode] = useState<"phase1_template" | "experimental_freeform">("phase1_template");
  const [phase1TemplateId, setPhase1TemplateId] = useState<Phase1TemplateId>("front_still_luxury");
  const [skuCode, setSkuCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = PHASE1_TEMPLATES.find((template) => template.template_id === phase1TemplateId) ?? PHASE1_TEMPLATES[0];

  async function loadImages() {
    if (!supabase) return;
    const { data } = await supabase
      .from("generations")
      .select("id,prompt,asset_url,url")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(40);
    const next = (data ?? []) as GalleryImage[];
    setImages(next);
    if (!selectedGenerationId && next[0]?.id) setSelectedGenerationId(next[0].id);
  }

  async function loadProfiles() {
    const res = await fetch("/api/studio/video/v2/source-profiles", { cache: "no-store" });
    const payload = (await res.json()) as { data?: SourceProfile[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load source profiles.");
    const next = payload.data ?? [];
    setProfiles(next);
    if (!selectedProfileId && next[0]?.id) setSelectedProfileId(next[0].id);
  }

  useEffect(() => {
    Promise.all([loadImages(), loadProfiles()]).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to initialize clip creation screen.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSourceProfile() {
    setError(null);
    setNote(null);
    const res = await fetch("/api/studio/video/v2/source-profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile_name: profileName,
        primary_generation_id: selectedGenerationId,
      }),
    });
    const payload = (await res.json()) as { data?: SourceProfile; error?: string };
    if (!res.ok || !payload.data) {
      setError(payload.error ?? "Failed to create source profile.");
      return;
    }

    setSelectedProfileId(payload.data.id);
    setNote("Source profile created. You can now create a clip intent.");
    await loadProfiles();
  }

  async function createIntent() {
    if (!selectedProfileId) {
      setError("Create/select a source profile first.");
      return;
    }

    setError(null);
    setNote(null);
    const res = await fetch("/api/studio/video/v2/clip-intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_profile_id: selectedProfileId,
        intent_label: intentLabel,
        motion_prompt: motionPrompt,
        production_mode: productionMode,
        phase1_template_id: productionMode === "phase1_template" ? phase1TemplateId : null,
        sku_code: skuCode.trim() || undefined,
      }),
    });
    const payload = (await res.json()) as { data?: { id: string }; error?: string };
    if (!res.ok || !payload.data?.id) {
      setError(payload.error ?? "Failed to create clip intent.");
      return;
    }

    setNote(`Clip intent ${payload.data.id.slice(0, 8)} created. Proceed to Working Pack Review to auto-build.`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Create Clip (Slice A)</h1>
            <p className="text-sm text-zinc-400">One source image is enough to start: create Source Profile → Clip Intent. Phase-1 Template Mode is the recommended production-safe path.</p>
          </div>
          <Link href="/studio/video/v2/working-packs-review" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900">Working Pack Review</Link>
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="font-medium">1) Pick source image</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {images.map((image) => {
              const imageUrl = image.asset_url ?? image.url;
              return (
                <button key={image.id} type="button" onClick={() => setSelectedGenerationId(image.id)} className={`rounded border p-2 text-left ${selectedGenerationId === image.id ? "border-cyan-400" : "border-zinc-700"}`}>
                  {imageUrl ? <img src={imageUrl} alt={image.id} className="mb-2 h-24 w-full rounded object-cover" /> : <div className="mb-2 h-24 rounded bg-zinc-950" />}
                  <p className="text-xs text-zinc-400">{image.id.slice(0, 8)}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <h2 className="font-medium">2) Create source profile</h2>
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          <button type="button" onClick={createSourceProfile} className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Create Source Profile</button>
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
            <option value="">-- select source profile --</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.profile_name} ({profile.id.slice(0, 8)})</option>
            ))}
          </select>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <h2 className="font-medium">3) Create clip intent</h2>
          <div className="rounded border border-zinc-700 bg-zinc-950/50 p-3">
            <p className="text-xs uppercase tracking-wide text-cyan-300">Generation Mode</p>
            <div className="mt-2 inline-flex rounded border border-zinc-700 bg-zinc-900/70 p-1 text-xs">
              <button type="button" onClick={() => setProductionMode("phase1_template")} className={`rounded px-2 py-1 ${productionMode === "phase1_template" ? "bg-cyan-500 text-zinc-950" : "text-zinc-300"}`}>Production Mode</button>
              <button type="button" onClick={() => setProductionMode("experimental_freeform")} className={`rounded px-2 py-1 ${productionMode === "experimental_freeform" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400"}`}>Experimental Mode</button>
            </div>
            {productionMode === "phase1_template" ? (
              <div className="mt-3 space-y-2">
                <label className="text-xs text-zinc-300">
                  Phase-1 template
                  <select value={phase1TemplateId} onChange={(event) => setPhase1TemplateId(event.target.value as Phase1TemplateId)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">
                    {PHASE1_TEMPLATES.map((template) => <option key={template.template_id} value={template.template_id}>{template.label}</option>)}
                  </select>
                </label>
                <div className="rounded border border-cyan-500/30 bg-cyan-500/10 p-2 text-xs text-cyan-100">
                  <p className="font-medium">{selectedTemplate.label}</p>
                  <p>{selectedTemplate.description}</p>
                  <p className="mt-1">Motion: {selectedTemplate.motion_profile} · Camera: {selectedTemplate.camera_profile} · Mode: {selectedTemplate.mode_preference}</p>
                  <p>Requires exact end state: {selectedTemplate.requires_exact_end_state ? "yes" : "no"}</p>
                  <p>Required truth roles: {selectedTemplate.required_roles.join(", ")}</p>
                  <p>Readiness: evaluated in Working Pack review after intent creation.</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-400">Experimental mode keeps manual free-form prompting and may drift more.</p>
            )}
          </div>
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={intentLabel} onChange={(event) => setIntentLabel(event.target.value)} />
          <textarea className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={motionPrompt} onChange={(event) => setMotionPrompt(event.target.value)} placeholder={productionMode === "phase1_template" ? "Optional scene flavor, e.g. high-end studio background with soft key light." : "Describe free-form motion and camera behavior."} />
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="SKU / dress code (optional)" value={skuCode} onChange={(event) => setSkuCode(event.target.value.toUpperCase())} />
          <button type="button" onClick={createIntent} className="rounded bg-violet-400 px-3 py-2 text-sm font-medium text-zinc-950">Create Clip Intent</button>
        </section>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {note ? <p className="text-sm text-emerald-300">{note}</p> : null}
      </div>
    </main>
  );
}
