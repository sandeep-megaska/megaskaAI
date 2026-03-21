import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RenderMetadata, RenderResult } from "@/lib/video/v2/types";

type RenderClip = {
  run_id: string;
  order_index: number;
  output_url: string;
};

type ClipProbe = {
  codec_name: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  sample_aspect_ratio: string | null;
  has_audio: boolean;
};

function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseFps(raw: string | undefined): number | null {
  if (!raw) return null;
  if (!raw.includes("/")) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const [aRaw, bRaw] = raw.split("/");
  const a = Number(aRaw);
  const b = Number(bRaw);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const fps = a / b;
  return Number.isFinite(fps) && fps > 0 ? fps : null;
}

async function probeClip(inputPath: string): Promise<ClipProbe> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-of",
    "json",
    inputPath,
  ]);

  const payload = JSON.parse(stdout) as {
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      sample_aspect_ratio?: string;
    }>;
  };

  const streams = payload.streams ?? [];
  const video = streams.find((entry) => entry.codec_type === "video");
  const hasAudio = streams.some((entry) => entry.codec_type === "audio");

  return {
    codec_name: video?.codec_name ?? null,
    width: typeof video?.width === "number" ? video.width : null,
    height: typeof video?.height === "number" ? video.height : null,
    fps: parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate),
    sample_aspect_ratio: video?.sample_aspect_ratio ?? null,
    has_audio: hasAudio,
  };
}

function canUseDemuxer(probes: ClipProbe[]) {
  if (!probes.length) return false;
  const head = probes[0];
  return probes.every((probe) => {
    const fpsClose = typeof head.fps === "number" && typeof probe.fps === "number" ? Math.abs(head.fps - probe.fps) < 0.02 : head.fps === probe.fps;
    return (
      probe.codec_name === head.codec_name &&
      probe.width === head.width &&
      probe.height === head.height &&
      probe.sample_aspect_ratio === head.sample_aspect_ratio &&
      fpsClose
    );
  });
}

async function runConcatDemuxer(inputPaths: string[], outputPath: string, listPath: string) {
  const content = inputPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, `${content}\n`, "utf8");
  await runCommand("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
}

async function runConcatFilter(inputPaths: string[], outputPath: string, includeAudio: boolean) {
  const args = ["-y"];
  for (const path of inputPaths) {
    args.push("-i", path);
  }

  const videoInputs = inputPaths.map((_, index) => `[${index}:v:0]`).join("");
  if (includeAudio) {
    const audioInputs = inputPaths.map((_, index) => `[${index}:a:0]`).join("");
    args.push(
      "-filter_complex",
      `${videoInputs}${audioInputs}concat=n=${inputPaths.length}:v=1:a=1[v][a]`,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      outputPath,
    );
  } else {
    args.push(
      "-filter_complex",
      `${videoInputs}concat=n=${inputPaths.length}:v=1:a=0[v]`,
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    );
  }

  await runCommand("ffmpeg", args);
}

async function uploadOutputVideo(supabase: SupabaseClient, outputBytes: Buffer, sequenceId: string) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";
  const filePath = `video/v2/sequence-exports/${sequenceId}/${Date.now()}-${randomUUID()}.mp4`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, outputBytes, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  if (!publicData?.publicUrl) {
    throw new Error("Unable to resolve exported sequence public URL.");
  }

  return {
    publicUrl: publicData.publicUrl,
    filePath,
  };
}

async function insertOutputAsset(supabase: SupabaseClient, sequenceId: string, outputUrl: string, metadata: RenderMetadata) {
  const { data, error } = await supabase
    .from("generations")
    .insert({
      prompt: `Sequence export ${sequenceId}`,
      type: "Video",
      media_type: "Video",
      status: "completed",
      asset_url: outputUrl,
      url: outputUrl,
      generation_kind: "video",
      video_meta: {
        ...metadata,
        source: "video-v2-sequence-render",
      },
      overlay_json: {
        source: "sequence_render",
      },
    })
    .select("id,asset_url,url")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create exported asset record.");

  return {
    id: data.id as string,
    output_url: (data.asset_url as string | null) ?? (data.url as string | null) ?? outputUrl,
  };
}

export async function renderSequence(supabase: SupabaseClient, sequenceId: string, clips: RenderClip[]): Promise<RenderResult> {
  if (!clips.length) {
    throw new Error("Sequence has no clips to render.");
  }

  if (clips.length === 1) {
    const clip = clips[0];
    const startedAt = new Date();
    const metadata: RenderMetadata = {
      render_started_at: startedAt.toISOString(),
      render_completed_at: new Date().toISOString(),
      render_duration: 0,
      render_method: "demuxer",
      compatibility: {
        codec_match: true,
        resolution_match: true,
        aspect_ratio_match: true,
        fps_match: true,
      },
    };
    const response = await fetch(clip.output_url);
    if (!response.ok) throw new Error(`Failed to download clip for export (${response.status}).`);
    const outputBytes = Buffer.from(await response.arrayBuffer());
    const uploaded = await uploadOutputVideo(supabase, outputBytes, sequenceId);
    const asset = await insertOutputAsset(supabase, sequenceId, uploaded.publicUrl, metadata);
    return {
      sequence_id: sequenceId,
      status: "exported",
      output_asset_id: asset.id,
      output_url: asset.output_url,
      metadata,
    };
  }

  let tempDir = "";
  const startedAt = new Date();

  try {
    tempDir = await mkdtemp(join(tmpdir(), "megaska-v2-render-"));
    const sortedClips = [...clips].sort((a, b) => a.order_index - b.order_index);

    const localPaths: string[] = [];
    for (const clip of sortedClips) {
      const response = await fetch(clip.output_url);
      if (!response.ok) {
        throw new Error(`Missing output video in sequence for run ${clip.run_id}.`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const localPath = join(tempDir, `${clip.order_index}-${clip.run_id}.mp4`);
      await writeFile(localPath, bytes);
      localPaths.push(localPath);
    }

    const probes: ClipProbe[] = [];
    for (const path of localPaths) {
      probes.push(await probeClip(path));
    }

    const head = probes[0];
    const compatibility = {
      codec_match: probes.every((probe) => probe.codec_name === head.codec_name),
      resolution_match: probes.every((probe) => probe.width === head.width && probe.height === head.height),
      aspect_ratio_match: probes.every((probe) => probe.sample_aspect_ratio === head.sample_aspect_ratio),
      fps_match: probes.every((probe) => {
        if (typeof head.fps !== "number" || typeof probe.fps !== "number") return head.fps === probe.fps;
        return Math.abs(head.fps - probe.fps) < 0.02;
      }),
    };

    const demuxerCandidate = canUseDemuxer(probes);
    const outputPath = join(tempDir, `rendered-${randomUUID()}.mp4`);
    let renderMethod: "demuxer" | "filter" = "demuxer";

    if (demuxerCandidate) {
      const concatListPath = join(tempDir, `concat-${randomUUID()}.txt`);
      try {
        await runConcatDemuxer(localPaths, outputPath, concatListPath);
      } catch {
        renderMethod = "filter";
      }
    } else {
      renderMethod = "filter";
    }

    if (renderMethod === "filter") {
      const includeAudio = probes.every((probe) => probe.has_audio);
      await runConcatFilter(localPaths, outputPath, includeAudio);
    }

    const outputBytes = await readFile(outputPath);
    const uploaded = await uploadOutputVideo(supabase, outputBytes, sequenceId);

    const completedAt = new Date();
    const metadata: RenderMetadata = {
      render_started_at: startedAt.toISOString(),
      render_completed_at: completedAt.toISOString(),
      render_duration: Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)),
      render_method: renderMethod,
      compatibility,
    };

    const asset = await insertOutputAsset(supabase, sequenceId, uploaded.publicUrl, metadata);

    return {
      sequence_id: sequenceId,
      status: "exported",
      output_asset_id: asset.id,
      output_url: asset.output_url,
      metadata,
      message: renderMethod === "filter" ? "Codec mismatch — fallback used" : undefined,
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
