import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export type OverlayPosition = "top" | "center" | "bottom";

export type OverlayConfig = {
  headline?: string;
  subtext?: string;
  cta?: string;
  position?: OverlayPosition;
};

function shellEscape(value: string) {
  return value.replaceAll("'", "\\'").replaceAll(":", "\\:");
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn("ffmpeg", args, { stdio: "ignore" });
    process.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with code ${code}`));
    });
    process.on("error", reject);
  });
}

export async function applyDeterministicOverlay(imageBuffer: Buffer, overlay: OverlayConfig): Promise<Buffer> {
  const headline = overlay.headline?.trim();
  const subtext = overlay.subtext?.trim();
  const cta = overlay.cta?.trim();

  if (!headline && !subtext && !cta) {
    return imageBuffer;
  }

  const dir = await mkdtemp(join(tmpdir(), "overlay-"));
  const inputPath = join(dir, "input.png");
  const outputPath = join(dir, "output.png");
  const positionY = overlay.position === "top" ? "80" : overlay.position === "center" ? "(h/2)-80" : "h-220";

  try {
    await writeFile(inputPath, imageBuffer);

    const filters = [
      headline
        ? `drawtext=text='${shellEscape(headline)}':x=60:y=${positionY}:fontsize=64:fontcolor=white:font=Arial`
        : null,
      subtext
        ? `drawtext=text='${shellEscape(subtext)}':x=60:y=${positionY}+78:fontsize=34:fontcolor=white:font=Arial`
        : null,
      cta ? `drawtext=text='${shellEscape(cta)}':x=60:y=${positionY}+130:fontsize=36:fontcolor=#c7d2fe:font=Arial` : null,
    ]
      .filter(Boolean)
      .join(",");

    await runFfmpeg(["-y", "-i", inputPath, "-vf", filters, outputPath]);
    return await readFile(outputPath);
  } catch (error) {
    console.warn("[overlay] failed, returning original image", error);
    return imageBuffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
