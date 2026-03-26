"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  createSimpleClipIntent,
  generateSimpleVideo,
  loadRunResult,
  retrySafer,
  uploadSimpleFrame,
  type SimpleMode,
} from "@/lib/video/v2/simpleFlowClient";

type GalleryImage = { id: string; prompt: string | null; asset_url?: string | null; url?: string | null };
type FrameSlot = "start" | "end";

export default function SimpleVideoStudioPage() {
  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }, []);

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [startFrame, setStartFrame] = useState<GalleryImage | null>(null);
  const [endFrame, setEndFrame] = useState<GalleryImage | null>(null);
  const [pickerSlot, setPickerSlot] = useState<FrameSlot>("start");
  const [prompt, setPrompt] = useState("Smooth, premium garment motion with soft studio light and controlled camera drift.");
  const [durationSeconds, setDurationSeconds] = useState<4 | 6 | 8>(4);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [mode, setMode] = useState<SimpleMode>("balanced");
  const [resolution, setResolution] = useState<"auto">("auto");
  const [skuCode, setSkuCode] = useState("");
  const [generationStatus, setGenerationStatus] = useState<"idle" | "planning" | "processing" | "completed" | "failed">("idle");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [outputAsset, setOutputAsset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const isGenerating = generationStatus === "planning" || generationStatus === "processing";

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("generations")
      .select("id,prompt,asset_url,url")
      .eq("generation_kind", "image")
      .order("created_at", { ascending: false })
      .limit(80)
      .then(({ data }) => {
        const next = (data ?? []) as GalleryImage[];
        setImages(next);
        setStartFrame(next[0] ?? null);
      });
  }, [supabase]);

  async function onUploadFrame(event: ChangeEvent<HTMLInputElement>, slot: FrameSlot) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setNote("Uploading frame...");
    try {
      const uploaded = await uploadSimpleFrame(file);
      const nextFrame = {
        id: uploaded.generationId,
        prompt: `Uploaded ${file.name}`,
        asset_url: uploaded.imageUrl,
        url: uploaded.imageUrl,
      } satisfies GalleryImage;
      setImages((prev) => [nextFrame, ...prev]);
      if (slot === "start") setStartFrame(nextFrame);
      if (slot === "end") setEndFrame(nextFrame);
      setNote("Frame uploaded and ready.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload frame.");
      setNote(null);
    }
  }

  async function onGenerateVideo() {
    if (!startFrame?.id) {
      setError("Start frame is required.");
      return;
    }

    setError(null);
    setNote(null);
    setOutputAsset(null);
    setGenerationStatus("planning");

    try {
      const intent = await createSimpleClipIntent({
        startGenerationId: startFrame.id,
        endGenerationId: endFrame?.id ?? null,
        prompt,
        durationSeconds,
        aspectRatio,
        skuCode,
      });

      const generated = await generateSimpleVideo({
        clipIntentId: intent.clipIntentId,
        hasEndFrame: Boolean(endFrame?.id),
        durationSeconds,
        mode,
      });

      setActiveRunId(generated.run_id);
      setGenerationStatus("processing");

      for (let attempts = 0; attempts < 24; attempts += 1) {
        const run = await loadRunResult(generated.run_id);
        if (run.outputUrl) {
          setOutputAsset(run.outputUrl);
          setGenerationStatus("completed");
          setNote("Clip completed.");
          return;
        }
        if (["failed", "canceled", "cancelled"].includes(run.status)) {
          setGenerationStatus("failed");
          throw new Error(run.failureMessage ?? "Video generation failed.");
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      setNote("Generation started. Output will appear shortly in run history.");
    } catch (generationError) {
      setGenerationStatus("failed");
      setError(generationError instanceof Error ? generationError.message : "Failed to generate video.");
    }
  }

  const progressSteps = ["Preparing frames", "Starting generation", "Waiting for output", "Finalizing clip"];

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Simple Clip Generator</h1>
            <p className="mt-1 text-sm text-zinc-400">Frame-based short clip creation for reliable garment fidelity.</p>
          </div>
          <Link href="/studio/video/v2/working-packs-review" className="text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-200">Open advanced workflow</Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            {(["start", "end"] as const).map((slot) => {
              const frame = slot === "start" ? startFrame : endFrame;
              return (
                <article key={slot} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-zinc-300">{slot === "start" ? "Start Frame" : "End Frame (optional)"}</h2>
                    {slot === "end" && frame ? (
                      <button type="button" className="text-xs text-zinc-400 underline" onClick={() => setEndFrame(null)}>Clear</button>
                    ) : null}
                  </div>
                  <div className="mt-4 h-56 overflow-hidden rounded-xl bg-zinc-950">
                    {frame?.asset_url || frame?.url ? (
                      <img src={frame.asset_url ?? frame.url ?? ""} alt={`${slot} frame`} className="h-full w-full object-cover" />
                    ) : <div className="flex h-full items-center justify-center text-xs text-zinc-500">{slot === "start" ? "Select or upload a start frame" : "Optional end frame"}</div>}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-center text-sm hover:bg-zinc-800">
                      Upload image
                      <input type="file" accept="image/*" className="hidden" onChange={(event) => onUploadFrame(event, slot)} />
                    </label>
                    <button type="button" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800" onClick={() => setPickerSlot(slot)}>Choose from Image Project</button>
                  </div>
                </article>
              );
            })}

            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h3 className="text-sm font-semibold text-zinc-300">Image Project assets</h3>
              <p className="mt-1 text-xs text-zinc-400">Select an existing image generation for {pickerSlot === "start" ? "Start Frame" : "End Frame"}.</p>
              <div className="mt-3 grid max-h-72 grid-cols-3 gap-3 overflow-y-auto">
                {images.map((image) => {
                  const imageUrl = image.asset_url ?? image.url;
                  if (!imageUrl) return null;
                  return (
                    <button key={`${pickerSlot}-${image.id}`} type="button" onClick={() => pickerSlot === "start" ? setStartFrame(image) : setEndFrame(image)} className="overflow-hidden rounded-lg border border-zinc-700 hover:border-cyan-400">
                      <img src={imageUrl} alt={image.id} className="h-24 w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </article>
          </div>

          <div className="space-y-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="text-lg font-semibold">Prompt</h2>
              <p className="mt-2 text-xs text-zinc-400">Frames define visual truth. Prompt defines motion, environment, mood, and camera feel between those frames.</p>
              <textarea className="mt-4 min-h-52 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </article>

            <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm">Duration
                  <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value) as 4 | 6 | 8)}>
                    <option value={4}>4s</option>
                    <option value={6}>6s</option>
                    <option value={8}>8s</option>
                  </select>
                </label>
                <label className="text-sm">Aspect Ratio
                  <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as "9:16" | "16:9" | "1:1")}>
                    <option value="9:16">9:16</option>
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                  </select>
                </label>
                <label className="text-sm">Resolution
                  <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={resolution} onChange={(event) => setResolution(event.target.value as "auto") }>
                    <option value="auto">Auto</option>
                  </select>
                </label>
                <label className="text-sm">Mode
                  <select className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" value={mode} onChange={(event) => setMode(event.target.value as SimpleMode)}>
                    <option value="strict">Strict</option>
                    <option value="balanced">Balanced</option>
                    <option value="creative">Creative</option>
                  </select>
                </label>
              </div>
              <input className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Optional SKU / garment code" value={skuCode} onChange={(event) => setSkuCode(event.target.value.toUpperCase())} />
              <button type="button" onClick={onGenerateVideo} disabled={isGenerating} className="mt-5 rounded-lg bg-violet-400 px-4 py-2 font-medium text-zinc-950 disabled:opacity-50">
                {isGenerating ? "Generating..." : "Generate Clip"}
              </button>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-lg font-semibold">Output</h2>
          {generationStatus === "idle" && !outputAsset ? (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
              Use a start frame and optional end frame to generate a short clip.
            </div>
          ) : null}

          {isGenerating ? (
            <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <p className="text-sm font-medium text-cyan-100">Generating clip...</p>
              <div className="mt-3 grid gap-2 text-xs">
                {progressSteps.map((step) => (
                  <div key={step} className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-3 py-2 text-cyan-100">{step}</div>
                ))}
              </div>
            </div>
          ) : null}

          {generationStatus === "failed" ? (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
              <p className="text-sm font-medium text-rose-200">Generation failed</p>
              <p className="mt-1 text-xs text-rose-300">This follows the same run status path as Studio V2. You can retry safely.</p>
            </div>
          ) : null}

          {outputAsset ? (
            <div className="mt-5 space-y-4">
              <video src={outputAsset} controls className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-black" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onGenerateVideo} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Retry</button>
                <button type="button" onClick={() => activeRunId ? retrySafer(activeRunId).catch((retryError) => setError(retryError instanceof Error ? retryError.message : "Retry failed.")) : null} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Retry safer</button>
                <a href={outputAsset} download className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Download</a>
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
          {note ? <p className="mt-4 text-sm text-emerald-300">{note}</p> : null}
        </section>
      </div>
    </main>
  );
}
