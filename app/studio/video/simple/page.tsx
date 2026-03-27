"use client";

import { useState } from "react";

type VideoAspectRatio = "16:9" | "9:16";
type VideoDuration = 4 | 6 | 8;

type SimpleVideoResponse = {
  success?: boolean;
  error?: string;
  data?: {
    video_url?: string;
    model?: string;
    duration_seconds?: number;
    aspect_ratio?: VideoAspectRatio;
  };
};

export default function SimpleVideoStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<VideoDuration>(6);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [startFrameUrl, setStartFrameUrl] = useState("");
  const [endFrameUrl, setEndFrameUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model: string; duration: number; aspectRatio: VideoAspectRatio } | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError("Enter a prompt first.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/studio/video/simple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          duration_seconds: duration,
          aspect_ratio: aspectRatio,
          first_frame_url: startFrameUrl.trim() || null,
          last_frame_url: endFrameUrl.trim() || null,
        }),
      });

      const payload = (await response.json()) as SimpleVideoResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to generate video.");
      }

      const generatedUrl = payload.data?.video_url ?? null;
      if (!generatedUrl) {
        throw new Error("Video generation succeeded but no video URL was returned.");
      }

      setVideoUrl(generatedUrl);
      setMeta({
        model: payload.data?.model ?? "unknown",
        duration: payload.data?.duration_seconds ?? duration,
        aspectRatio: payload.data?.aspect_ratio ?? aspectRatio,
      });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Failed to generate video.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
          <header className="mb-6 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Simple Video</p>
            <h1 className="text-3xl font-semibold">Standalone video generator</h1>
            <p className="text-sm text-zinc-400">Generate a single clip directly from provider APIs, without Studio V2 orchestration.</p>
          </header>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-200">Prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="h-32 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-400/50 focus:ring"
                placeholder="Describe the motion, subject behavior, and camera movement."
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-200">Duration</span>
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value) as VideoDuration)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                  <option value={4}>4s</option>
                  <option value={6}>6s</option>
                  <option value={8}>8s</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-200">Aspect ratio</span>
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as VideoAspectRatio)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-200">Start frame URL (optional)</span>
                <input
                  value={startFrameUrl}
                  onChange={(event) => setStartFrameUrl(event.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-200">End frame URL (optional)</span>
                <input
                  value={endFrameUrl}
                  onChange={(event) => setEndFrameUrl(event.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="rounded-xl border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Generating..." : "Generate clip"}
            </button>

            {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
          <header className="mb-4">
            <h2 className="text-lg font-semibold">Output panel</h2>
            <p className="text-sm text-zinc-400">The latest generated clip appears here.</p>
          </header>

          {isGenerating ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/60 p-4 text-sm text-zinc-300">Generating clip… this can take a minute.</div>
          ) : null}

          {!isGenerating && videoUrl ? (
            <div className="space-y-3">
              <video className="w-full rounded-xl border border-zinc-700 bg-black" src={videoUrl} controls playsInline />
              <a href={videoUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">
                Open video URL
              </a>
              {meta ? <p className="text-xs text-zinc-400">{meta.model} · {meta.duration}s · {meta.aspectRatio}</p> : null}
            </div>
          ) : null}

          {!isGenerating && !videoUrl ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950/60 p-4 text-sm text-zinc-400">No output yet. Generate a clip to populate this panel.</div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
