import { spawn } from "node:child_process";

type MetricImage = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

type FfmpegProbe = {
  durationSec: number;
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

export async function probeVideoDuration(inputPath: string): Promise<FfmpegProbe> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);

  const durationSec = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error("ffprobe returned invalid duration");
  }
  return { durationSec };
}

export async function decodeFrameToRgb(
  inputPath: string,
  opts: { timestampSec?: number; width?: number; height?: number },
): Promise<MetricImage> {
  const width = opts.width ?? 32;
  const height = opts.height ?? 32;
  const args = ["-v", "error"];

  if (typeof opts.timestampSec === "number") {
    args.push("-ss", String(Math.max(0, opts.timestampSec)));
  }

  args.push(
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  );

  return new Promise<MetricImage>((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg decode failed (${code}): ${stderr}`));
        return;
      }
      const buffer = Buffer.concat(chunks);
      const expectedBytes = width * height * 3;
      if (buffer.length < expectedBytes) {
        reject(new Error(`Decoded frame too small (${buffer.length}/${expectedBytes})`));
        return;
      }
      resolve({ width, height, pixels: new Uint8Array(buffer.subarray(0, expectedBytes)) });
    });
  });
}

export function imageAverageColor(image: MetricImage) {
  let r = 0;
  let g = 0;
  let b = 0;
  const total = image.width * image.height;
  for (let i = 0; i < image.pixels.length; i += 3) {
    r += image.pixels[i] ?? 0;
    g += image.pixels[i + 1] ?? 0;
    b += image.pixels[i + 2] ?? 0;
  }
  return { r: r / total, g: g / total, b: b / total };
}

export function cropImage(image: MetricImage, xStartRatio: number, yStartRatio: number, xEndRatio: number, yEndRatio: number): MetricImage {
  const x1 = Math.max(0, Math.floor(image.width * xStartRatio));
  const y1 = Math.max(0, Math.floor(image.height * yStartRatio));
  const x2 = Math.min(image.width, Math.ceil(image.width * xEndRatio));
  const y2 = Math.min(image.height, Math.ceil(image.height * yEndRatio));
  const width = Math.max(1, x2 - x1);
  const height = Math.max(1, y2 - y1);
  const pixels = new Uint8Array(width * height * 3);

  let dest = 0;
  for (let y = y1; y < y2; y += 1) {
    for (let x = x1; x < x2; x += 1) {
      const src = (y * image.width + x) * 3;
      pixels[dest] = image.pixels[src] ?? 0;
      pixels[dest + 1] = image.pixels[src + 1] ?? 0;
      pixels[dest + 2] = image.pixels[src + 2] ?? 0;
      dest += 3;
    }
  }

  return { width, height, pixels };
}

export function differenceToScore(a: MetricImage, b: MetricImage) {
  const length = Math.min(a.pixels.length, b.pixels.length);
  if (!length) return 0;

  let diff = 0;
  for (let i = 0; i < length; i += 1) {
    diff += Math.abs((a.pixels[i] ?? 0) - (b.pixels[i] ?? 0));
  }

  const max = (length / 3) * (255 * 3);
  const normalized = Math.min(1, diff / max);
  return Math.round((1 - normalized) * 100);
}

export function colorSimilarityScore(a: MetricImage, b: MetricImage) {
  const ca = imageAverageColor(a);
  const cb = imageAverageColor(b);
  const distance = Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
  const normalized = Math.min(1, distance / Math.sqrt(255 ** 2 * 3));
  return Math.round((1 - normalized) * 100);
}
