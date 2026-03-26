import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
        return;
      }
      resolve();
    });
  });
}

export async function createValidationPreviewClip(input: {
  supabase: SupabaseClient;
  bucket: string;
  runId: string;
  videoBytes: Buffer;
  previewSeconds?: number;
}) {
  let tempDir = "";
  try {
    tempDir = await mkdtemp(join(tmpdir(), "megaska-v2-validation-preview-"));
    const sourcePath = join(tempDir, "source.mp4");
    const previewPath = join(tempDir, "preview.mp4");
    await writeFile(sourcePath, input.videoBytes);
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-t",
      String(Math.max(1, Math.min(4, Number(input.previewSeconds ?? 3)))),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-an",
      "-movflags",
      "+faststart",
      previewPath,
    ]);
    const previewBytes = await readFile(previewPath);
    const previewPathStorage = `videos/validation-preview/${input.runId}-${Date.now()}-${randomUUID()}.mp4`;
    const { error } = await input.supabase.storage.from(input.bucket).upload(previewPathStorage, previewBytes, {
      contentType: "video/mp4",
      upsert: false,
    });
    if (error) throw new Error(error.message);

    const { data } = input.supabase.storage.from(input.bucket).getPublicUrl(previewPathStorage);

    return {
      autoTrimProduced: Boolean(data.publicUrl),
      previewAssetUrl: data.publicUrl,
      previewDurationSeconds: Number(input.previewSeconds ?? 3),
      previewStoragePath: previewPathStorage,
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
