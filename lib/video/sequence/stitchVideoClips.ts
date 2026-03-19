import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

export type StitchInputClip = {
  clipId: string;
  bytes: Buffer;
};

export type StitchResult = {
  bytes: Buffer;
  mimeType: "video/mp4";
  diagnostics: Record<string, unknown>;
};

function runFfmpegConcat(inputPaths: string[], outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const args = ["-y"];
    for (const path of inputPaths) {
      args.push("-i", path);
    }

    args.push(
      "-filter_complex",
      `${inputPaths.map((_, index) => `[${index}:v:0]`).join("")}concat=n=${inputPaths.length}:v=1:a=0[v]`,
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    );

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg concat failed (${code}): ${stderr}`));
        return;
      }
      resolve();
    });
  });
}

export async function stitchVideoClips(clips: StitchInputClip[]): Promise<StitchResult> {
  if (clips.length === 0) {
    throw new Error("No clips provided for stitching.");
  }

  if (clips.length === 1) {
    return {
      bytes: clips[0]?.bytes ?? Buffer.alloc(0),
      mimeType: "video/mp4",
      diagnostics: {
        strategy: "single-clip-bypass",
        clipCount: 1,
      },
    };
  }

  let tempDir = "";
  try {
    tempDir = await mkdtemp(join(tmpdir(), "megaska-video-stitch-"));
    const inputPaths: string[] = [];

    for (const [index, clip] of clips.entries()) {
      const inputPath = join(tempDir, `${index + 1}-${clip.clipId}.mp4`);
      await writeFile(inputPath, clip.bytes);
      inputPaths.push(inputPath);
    }

    const outputPath = join(tempDir, `stitched-${randomUUID()}.mp4`);
    await runFfmpegConcat(inputPaths, outputPath);

    const stitchedBytes = await import("node:fs/promises").then(({ readFile }) => readFile(outputPath));

    return {
      bytes: stitchedBytes,
      mimeType: "video/mp4",
      diagnostics: {
        strategy: "ffmpeg-concat-filter",
        clipCount: clips.length,
      },
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
