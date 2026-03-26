"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  createSimpleClipIntent,
  fixMissingAngles,
  generateSimpleVideo,
  loadReadiness,
  loadRunResult,
  retrySafer,
  type SimpleMotionType,
  type SimpleReadiness,
  type SimpleViewState,
} from "@/lib/video/v2/simpleFlowClient";

type GalleryImage = { id: string; prompt: string | null; asset_url?: string | null; url?: string | null };

const ROLE_LABELS: Array<{ key: string; label: string; aliases: string[] }> = [
  { key: "front", label: "Front", aliases: ["front"] },
  { key: "back", label: "Back", aliases: ["back"] },
  { key: "three_quarter_left", label: "3/4 Left", aliases: ["three_quarter_left"] },
  { key: "three_quarter_right", label: "3/4 Right", aliases: ["three_quarter_right"] },
  { key: "fit", label: "Fit", aliases: ["fit_anchor", "fit_profile"] },
  { key: "detail", label: "Detail", aliases: ["detail"] },
];

const MOTION_OPTIONS: Array<{ id: SimpleMotionType; label: string; start: SimpleViewState; end: SimpleViewState; description: string }> = [
  { id: "front_pose", label: "Front Pose", start: "front", end: "front", description: "Safe hero pose with micro movement." },
  { id: "slight_turn", label: "Slight Turn", start: "front", end: "three_quarter_right", description: "Small angle change for depth." },
  { id: "turn_to_back", label: "Turn to Back", start: "front", end: "back", description: "Guided turn with fidelity protection." },
  { id: "detail_reveal", label: "Detail Reveal", start: "front", end: "detail", description: "Controlled fabric detail emphasis." },
];

export default function SimpleVideoStudioPage() {
  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selectedSourceImage, setSelectedSourceImage] = useState<GalleryImage | null>(null);
  const [skuCode, setSkuCode] = useState("");
  const [clipIntentId, setClipIntentId] = useState("");
  const [motionType, setMotionType] = useState<SimpleMotionType>("slight_turn");
  const [startState, setStartState] = useState<SimpleViewState>("front");
  const [endState, setEndState] = useState<SimpleViewState>("three_quarter_right");
  const [durationSeconds, setDurationSeconds] = useState<4 | 6 | 8>(4);
  const [validationMode, setValidationMode] = useState(true);
  const [motionComplexity, setMotionComplexity] = useState<"low" | "medium" | "high">("low");
  const [cameraMode, setCameraMode] = useState<"locked" | "slight">("locked");
  const [readiness, setReadiness] = useState<SimpleReadiness | null>(null);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "planning" | "processing" | "completed">("idle");
  const [outputAsset, setOutputAsset] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeOutputGenerationId, setActiveOutputGenerationId] = useState<string | null>(null);
  const [activeOutputThumbnail, setActiveOutputThumbnail] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("pending");
  const [approved, setApproved] = useState(false);
  const [promotingTruth, setPromotingTruth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fixingAngles, setFixingAngles] = useState(false);
  const [fixStatus, setFixStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("generations")
      .select("id,prompt,asset_url,url")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => {
        const next = (data ?? []) as GalleryImage[];
        setImages(next);
        setSelectedSourceImage(next[0] ?? null);
      });
  }, [supabase]);

  useEffect(() => {
    const selectedMotion = MOTION_OPTIONS.find((option) => option.id === motionType);
    if (!selectedMotion) return;
    setStartState(selectedMotion.start);
    setEndState(selectedMotion.end);
  }, [motionType]);

  useEffect(() => {
    if (validationMode && durationSeconds !== 4) setDurationSeconds(4);
  }, [validationMode, durationSeconds]);

  async function ensureIntent() {
    if (clipIntentId) return clipIntentId;
    if (!selectedSourceImage?.id) throw new Error("Select a source image first.");
    const created = await createSimpleClipIntent({
      selectedGenerationId: selectedSourceImage.id,
      skuCode,
      motionPrompt: `${MOTION_OPTIONS.find((option) => option.id === motionType)?.description ?? "Controlled motion"} Camera ${cameraMode}.`,
      intentLabel: `Simple ${motionType.replaceAll("_", " ")}`,
      durationSeconds,
    });
    setClipIntentId(created.clipIntentId);
    return created.clipIntentId;
  }

  async function refreshReadiness() {
    setError(null);
    setNote(null);
    const intentId = await ensureIntent();
    const next = await loadReadiness({ clipIntentId: intentId, startState, endState, durationSeconds, validationMode, motionComplexity });
    setReadiness(next);
    setNote("System plan updated.");
  }

  async function onFixMissingAngles() {
    setError(null);
    setNote(null);
    setFixingAngles(true);
    try {
      const intentId = await ensureIntent();
      await fixMissingAngles({
        clipIntentId: intentId,
        skuCode,
        roles: readiness?.missingRoles ?? [],
        startState,
        endState,
        durationSeconds,
        validationMode,
        motionComplexity,
      }, (step) => setFixStatus(step));

      const next = await loadReadiness({ clipIntentId: intentId, startState, endState, durationSeconds, validationMode, motionComplexity });
      setReadiness(next);

      const unresolvedPriorityRoles = ["three_quarter_left", "three_quarter_right", "fit_anchor", "fit_profile", "fit", "detail"]
        .filter((role) => next.missingRoles.includes(role));

      if (unresolvedPriorityRoles.length > 0) {
        setNote(`Some angles still need manual help: ${unresolvedPriorityRoles.join(", ")}. You can continue and use advanced review if needed.`);
      } else {
        setNote("Angles are ready. You can generate video now.");
      }
    } catch (fixError) {
      setError(fixError instanceof Error ? fixError.message : "Could not fix angles automatically. You can keep editing and try advanced review.");
    } finally {
      setFixingAngles(false);
      setFixStatus(null);
    }
  }

  async function onGenerateVideo() {
    setError(null);
    setNote(null);
    setGenerationStatus("planning");
    try {
      const intentId = await ensureIntent();
      const latestReadiness = await loadReadiness({ clipIntentId: intentId, startState, endState, durationSeconds, validationMode, motionComplexity });
      setReadiness(latestReadiness);
      if (latestReadiness.decision === "block") {
        throw new Error(latestReadiness.blockedReasons[0] ?? latestReadiness.reasons[0] ?? "This shot is currently blocked.");
      }
      if (latestReadiness.missingRoles.length > 0) {
        setGenerationStatus("idle");
        return;
      }

      setGenerationStatus("processing");
      const generated = await generateSimpleVideo({ clipIntentId: intentId, startState, endState, durationSeconds, validationMode, motionComplexity });
      setActiveRunId(generated.run_id);
      setApproved(false);

      for (let attempts = 0; attempts < 20; attempts += 1) {
        const run = await loadRunResult(generated.run_id);
        setOutcome(run.outcome);
        setActiveOutputGenerationId(run.outputGenerationId);
        setActiveOutputThumbnail(run.outputThumbnailUrl);
        setApproved(run.acceptedForSequence);
        if (run.outputUrl) {
          setOutputAsset(run.outputUrl);
          setGenerationStatus("completed");
          setNote("Video completed.");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      setGenerationStatus("processing");
      setNote("Generation started. Output will appear shortly in run history.");
    } catch (generationError) {
      setGenerationStatus("idle");
      setError(generationError instanceof Error ? generationError.message : "Failed to generate video.");
    }
  }

  async function onApprove() {
    if (!activeRunId) return;
    setError(null);
    await fetch("/api/studio/video/v2/runs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ run_id: activeRunId, action_type: "accept", accepted_for_sequence: true }),
    });
    setApproved(true);
    setNote("Clip approved.");
  }

  async function onRetrySameSegment() {
    if (!activeRunId) return;
    setError(null);
    await fetch("/api/studio/video/v2/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_run_id: activeRunId, retry_strategy: "same_plan", retry_reason: "Simple workflow retry this segment." }),
    });
    setNote("Retry queued with same segment plan.");
  }

  async function onPromoteFrameToTruth() {
    if (!activeOutputGenerationId || !activeOutputThumbnail || !skuCode.trim()) {
      setNote("To promote to truth, add an SKU and generate a clip with a preview frame.");
      return;
    }
    setPromotingTruth(true);
    setError(null);
    setNote(null);
    try {
      const extracted = await fetch("/api/studio/video/extract-frame", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_video_generation_id: activeOutputGenerationId,
          frame_url: activeOutputThumbnail,
          extraction_method: "thumbnail",
        }),
      });
      const extractedPayload = (await extracted.json()) as { generationId?: string; error?: string };
      if (!extracted.ok || !extractedPayload.generationId) {
        throw new Error(extractedPayload.error ?? "Could not promote frame.");
      }

      const truthResponse = await fetch("/api/studio/video/v2/sku-truth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku_code: skuCode.trim(),
          role: endState,
          generation_id: extractedPayload.generationId,
          source_kind: "manual_verified_override",
          label: `Simple review promotion (${endState.replaceAll("_", " ")})`,
          notes: "Promoted from Simple Video Studio output panel.",
          clip_intent_id: clipIntentId || undefined,
          apply_now: Boolean(clipIntentId),
        }),
      });
      if (!truthResponse.ok) {
        const payload = (await truthResponse.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not register truth entry.");
      }

      setNote("Frame promoted to truth registry and linked to this SKU.");
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : "Could not promote frame to truth.");
    } finally {
      setPromotingTruth(false);
    }
  }

  const missingTruth = readiness?.missingRoles ?? [];
  const needsFix = missingTruth.length > 0;

  const statusBadge = approved
    ? { label: "Approved", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" }
    : outcome === "pass"
      ? { label: "Ready for review", className: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" }
      : outcome === "retry"
        ? { label: "Needs retry", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" }
        : { label: "Review pending", className: "border-zinc-600 bg-zinc-800/50 text-zinc-200" };
  const outputSummary = approved
    ? "Accepted in this simple workflow. You can continue sequence assembly later in advanced mode."
    : outcome === "pass"
      ? "Clip looks viable from validation. Approve or continue with a targeted retry."
      : outcome === "retry"
        ? "Validation suggests another pass. Retry safer defaults or retry this segment."
        : "Review the clip and choose the next action.";

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Simple Video Studio</h1>
            <p className="mt-1 text-sm text-zinc-400">Founder-friendly guided video creation with built-in fidelity safeguards.</p>
          </div>
          <Link href="/studio/video/v2/working-packs-review" className="text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-200">Open advanced workflow</Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-[380px,1fr]">
          <div className="space-y-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="text-sm font-semibold text-zinc-300">Master Visual</h2>
              <div className="mt-4 h-56 overflow-hidden rounded-xl bg-zinc-950">
                {selectedSourceImage?.asset_url || selectedSourceImage?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedSourceImage.asset_url ?? selectedSourceImage.url ?? ""} alt="source" className="h-full w-full object-cover" />
                ) : <div className="flex h-full items-center justify-center text-xs text-zinc-500">Select a source image</div>}
              </div>
              <p className="mt-3 text-xs text-zinc-400">SKU</p>
              <input className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={skuCode} onChange={(event) => setSkuCode(event.target.value.toUpperCase())} placeholder="Optional SKU / garment code" />
              <div className="mt-3 inline-flex rounded-full border border-zinc-700 px-3 py-1 text-xs">
                Truth status: {needsFix ? "Needs attention" : "Ready"}
              </div>
              <div className="mt-4 grid gap-2">
                <select className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={selectedSourceImage?.id ?? ""} onChange={(event) => setSelectedSourceImage(images.find((img) => img.id === event.target.value) ?? null)}>
                  <option value="">Change Image</option>
                  {images.map((image) => <option key={image.id} value={image.id}>{image.id.slice(0, 8)}</option>)}
                </select>
                <Link href="/" className="rounded-lg border border-zinc-700 px-3 py-2 text-center text-sm hover:bg-zinc-800">Open Image Project</Link>
              </div>
            </article>

            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="text-sm font-semibold text-zinc-300">Truth Readiness</h2>
              <p className="mt-2 text-xs text-zinc-400">We check whether required angles are available before generation so your first run is safer.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {ROLE_LABELS.map((role) => {
                  const present = readiness
                    ? role.aliases.some((alias) => !missingTruth.includes(alias))
                    : false;
                  return (
                    <span key={role.key} className={`rounded-full border px-3 py-1 text-xs ${present ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
                      {role.label} · {present ? "Present" : "Missing"}
                    </span>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={onFixMissingAngles} disabled={fixingAngles} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60">{fixingAngles ? "Fixing…" : "Fix Automatically"}</button>
                <Link href="/studio/video/v2/working-packs-review" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Manage Truth Registry</Link>
              </div>
              {fixStatus ? <p className="mt-3 text-xs text-cyan-200">{fixStatus}</p> : null}
            </article>
          </div>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <h2 className="text-lg font-semibold">Create Video</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {MOTION_OPTIONS.map((option) => (
                <button key={option.id} type="button" onClick={() => setMotionType(option.id)} className={`rounded-xl border p-3 text-left ${motionType === option.id ? "border-cyan-400 bg-cyan-500/10" : "border-zinc-700 bg-zinc-900"}`}>
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-xs text-zinc-400">{option.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm">Start view
                <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={startState} onChange={(event) => setStartState(event.target.value as SimpleViewState)}>
                  <option value="front">Front</option><option value="three_quarter_left">3/4 Left</option><option value="three_quarter_right">3/4 Right</option><option value="back">Back</option><option value="detail">Detail</option>
                </select>
              </label>
              <label className="text-sm">End view
                <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={endState} onChange={(event) => setEndState(event.target.value as SimpleViewState)}>
                  <option value="front">Front</option><option value="three_quarter_left">3/4 Left</option><option value="three_quarter_right">3/4 Right</option><option value="back">Back</option><option value="detail">Detail</option>
                </select>
              </label>
              <label className="text-sm">Duration
                <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value) as 4 | 6 | 8)}>
                  <option value={4}>4s</option><option value={6}>6s</option><option value={8}>8s</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input type="checkbox" checked={validationMode} onChange={(event) => setValidationMode(event.target.checked)} /> Validation mode (recommended)
              </label>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="text-sm">Motion complexity
                <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={motionComplexity} onChange={(event) => setMotionComplexity(event.target.value as "low" | "medium" | "high")}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </label>
              <label className="text-sm">Camera
                <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={cameraMode} onChange={(event) => setCameraMode(event.target.value as "locked" | "slight")}>
                  <option value="locked">Locked</option><option value="slight">Slight</option>
                </select>
              </label>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <p>Garment risk: {readiness?.garmentRisk ?? "Risk not assessed yet"}</p>
                {!readiness?.garmentRisk ? <p className="mt-1 text-[11px] text-amber-100/90">Risk will be checked during planning.</p> : null}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-950/50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">System Plan</h3>
                <button type="button" onClick={refreshReadiness} className="text-xs text-cyan-300 underline">Refresh plan</button>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-zinc-300">
                {(readiness?.statusLines ?? ["We’ll check angles, choose the safest path, and prepare a short validation clip."]).map((line) => <li key={line}>• {line}</li>)}
              </ul>
              {missingTruth.length > 0 ? <p className="mt-3 text-sm text-rose-300">We need a few more angles before safe generation. Missing: {missingTruth.join(", ")}</p> : null}
              <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                <p>Strategy: <span className="text-zinc-200">{readiness?.strategy ?? "pending"}</span></p>
                <p>Path: <span className="text-zinc-200">{readiness?.pathSummary ?? "-"}</span></p>
                <p>Duration: <span className="text-zinc-200">{durationSeconds}s</span></p>
                <p>Validation mode: <span className="text-zinc-200">{validationMode ? "On" : "Off"}</span></p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              {needsFix ? (
                <button type="button" onClick={onFixMissingAngles} disabled={fixingAngles} className="rounded-lg bg-cyan-400 px-4 py-2 font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60">{fixingAngles ? "Fixing…" : "Fix Automatically"}</button>
              ) : (
                <button type="button" onClick={onGenerateVideo} disabled={fixingAngles} className="rounded-lg bg-violet-400 px-4 py-2 font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60">Generate Video</button>
              )}
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-lg font-semibold">Output</h2>
          {generationStatus === "idle" && !outputAsset ? (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="text-sm text-zinc-200">No output yet</p>
              <p className="mt-1 text-xs text-zinc-400">Generate a clip to unlock review actions (approve, retry, promote, download).</p>
            </div>
          ) : null}

          {generationStatus === "planning" || generationStatus === "processing" ? (
            <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <p className="text-sm font-medium text-cyan-100">Generation in progress</p>
              <div className="mt-3 grid gap-2 text-xs">
                {[
                  { label: "Checking truth", active: true },
                  { label: "Preparing plan", active: true },
                  { label: "Generating clip", active: generationStatus === "processing" },
                  { label: "Reviewing output", active: false },
                ].map((step) => (
                  <div key={step.label} className={`rounded-lg border px-3 py-2 ${step.active ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100" : "border-zinc-700 text-zinc-400"}`}>
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {outputAsset ? (
            <div className="mt-5 space-y-4">
              <video src={outputAsset} controls className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-black" />
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs ${statusBadge.className}`}>{statusBadge.label}</div>
              <p className="text-sm text-zinc-300">{outputSummary}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onApprove().catch((approveError) => setError(approveError instanceof Error ? approveError.message : "Approve failed."))} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Approve</button>
                <button type="button" onClick={() => activeRunId ? retrySafer(activeRunId).catch((retryError) => setError(retryError instanceof Error ? retryError.message : "Retry failed.")) : null} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Retry safer</button>
                {readiness?.strategy === "segmented" ? (
                  <button type="button" onClick={() => onRetrySameSegment().catch((retryError) => setError(retryError instanceof Error ? retryError.message : "Retry failed."))} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Retry this segment</button>
                ) : null}
                <button type="button" onClick={() => onPromoteFrameToTruth().catch((promotionError) => setError(promotionError instanceof Error ? promotionError.message : "Promotion failed."))} disabled={promotingTruth} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">{promotingTruth ? "Promoting…" : "Promote frame to truth"}</button>
                <a href={outputAsset} download className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Download</a>
              </div>
              <p className="text-xs text-zinc-500">Retry Safer uses validation mode, low motion, locked camera, and shortest safe duration by reusing the current run orchestration.</p>
              {!skuCode.trim() ? <p className="text-xs text-amber-200">Add an SKU code to enable truth promotion in one click.</p> : null}
              <Link href="/studio/video/v2/working-packs-review" className="inline-block text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-200">Open advanced review & truth registry</Link>
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
          {note ? <p className="mt-4 text-sm text-emerald-300">{note}</p> : null}
        </section>
      </div>
    </main>
  );
}
