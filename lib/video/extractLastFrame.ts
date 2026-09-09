/**
 * Pull the closing frame out of a finished clip, so it can open the next one.
 *
 * This runs in the browser rather than on the server: extraction needs a video
 * decoder, the deployment target is serverless with no ffmpeg, and the bytes are
 * already on the viewer's machine because they just watched the clip.
 */

export type ExtractedFrame = {
  blob: Blob;
  width: number;
  height: number;
  /** Where in the clip the frame was taken, in seconds. */
  atSeconds: number;
};

export class FrameExtractionError extends Error {
  readonly reason: "load" | "seek" | "tainted" | "encode" | "blank";

  constructor(reason: FrameExtractionError["reason"], message: string) {
    super(message);
    this.name = "FrameExtractionError";
    this.reason = reason;
  }
}

/**
 * Seeking to exactly `duration` usually lands past the last decodable frame and
 * paints black, so back off slightly. A frame time is ~33ms at 30fps; 80ms is
 * comfortably inside the final frame without being visibly earlier than the end.
 */
const END_OFFSET_SECONDS = 0.08;

/** Guards against a decoder that never fires `seeked` on a malformed file. */
const TIMEOUT_MS = 15_000;

/**
 * Timestamps to try, closest to the end first.
 *
 * Encoders differ in how much of the tail is decodable, so a single guess is
 * not enough; walking backwards finds the last frame that actually paints.
 * Clamped to zero so a clip shorter than the offsets still yields valid seeks.
 */
export function frameAttemptTimes(duration: number): number[] {
  const offsets = [END_OFFSET_SECONDS, 0.2, 0.5];
  const times = offsets.map((offset) => Math.max(0, duration - offset));
  // Drop duplicates, which happens for very short clips where every offset
  // clamps to zero.
  return [...new Set(times)];
}

/**
 * Is this frame past the end of the decodable stream?
 *
 * Seeking beyond the last frame paints uniform black, so that is what we look
 * for: uniform AND near-black. Uniformity alone is not enough — a clip ending
 * on a plain studio sweep, a solid colour card or a white fade is perfectly
 * usable and perfectly uniform, and an earlier version of this check rejected
 * exactly those.
 *
 * A clip that genuinely fades to black is also unusable as an opening frame, so
 * treating it the same way and stepping back is the behaviour we want anyway.
 */
function isUnusableFrame(context: CanvasRenderingContext2D, width: number, height: number) {
  // One readback, then sample a coarse grid over it: getImageData per pixel is
  // orders of magnitude slower and this runs on every seek attempt.
  const { data } = context.getImageData(0, 0, width, height);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 16));

  let min = 255;
  let max = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      const luma = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
      if (luma < min) min = luma;
      if (luma > max) max = luma;
    }
  }

  const uniform = max - min < 2;
  const nearBlack = max < 8;
  return uniform && nearBlack;
}

async function seekTo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.001) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new FrameExtractionError("seek", "Seeking timed out.")), TIMEOUT_MS);
    const done = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = time;
  });
}

/**
 * The clip's real duration.
 *
 * `video.duration` is not always trustworthy on load: containers written by a
 * streaming muxer often carry no duration in the header, so browsers report
 * `Infinity` or a short partial value until the file has been scrubbed. Taking
 * that number at face value silently extracts a frame from the middle of the
 * clip instead of the end — which looks like success and is not.
 *
 * Seeking far past the end makes the browser clamp to the true final position,
 * and `currentTime` then reports it.
 */
async function resolveDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    const reported = video.duration;
    // Confirm the reported value by seeking to it: if the browser clamps us
    // meaningfully earlier, the header was lying.
    await seekTo(video, reported);
    if (video.currentTime >= reported - 0.05) return reported;
    return video.currentTime;
  }

  await seekTo(video, 1e7);
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return Number.isFinite(video.currentTime) ? video.currentTime : 0;
}

/**
 * Decode `videoUrl` and return its final frame as a PNG blob.
 *
 * Throws `FrameExtractionError` with a `reason` the caller can turn into
 * something a seller can act on — in particular `tainted`, which means the
 * storage bucket is not sending CORS headers and no amount of retrying will
 * help.
 */
export async function extractLastFrame(videoUrl: string): Promise<ExtractedFrame> {
  const video = document.createElement("video");
  // Required before any frame reaches a canvas: without it the canvas is
  // tainted and toBlob throws a SecurityError.
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = videoUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new FrameExtractionError("load", "The clip took too long to load.")),
        TIMEOUT_MS,
      );
      video.addEventListener(
        "loadeddata",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          window.clearTimeout(timer);
          reject(new FrameExtractionError("load", "The clip could not be decoded in this browser."));
        },
        { once: true },
      );
    });

    const duration = await resolveDuration(video);
    if (!duration) throw new FrameExtractionError("load", "The clip reported no duration.");

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new FrameExtractionError("load", "The clip reported no dimensions.");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new FrameExtractionError("encode", "This browser did not provide a canvas context.");

    const attempts = frameAttemptTimes(duration);

    let atSeconds = attempts[0];
    let captured = false;

    for (const time of attempts) {
      await seekTo(video, time);
      context.drawImage(video, 0, 0, width, height);
      atSeconds = time;

      try {
        if (!isUnusableFrame(context, width, height)) {
          captured = true;
          break;
        }
      } catch {
        // getImageData throws on a tainted canvas, which is a CORS problem
        // rather than a blank frame — and it will not resolve on retry.
        throw new FrameExtractionError(
          "tainted",
          "The clip's storage is not sending CORS headers, so its frames cannot be read.",
        );
      }
    }

    if (!captured) {
      throw new FrameExtractionError("blank", "The end of this clip decoded as black.");
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new FrameExtractionError("encode", "The extracted frame could not be encoded.");

    return { blob, width, height, atSeconds };
  } finally {
    // Drop the source so the decoder releases the buffered clip.
    video.removeAttribute("src");
    video.load();
  }
}

/** Turn a `FrameExtractionError` into something worth showing a seller. */
export function describeExtractionFailure(error: unknown): string {
  if (error instanceof FrameExtractionError) {
    switch (error.reason) {
      case "tainted":
        return "This clip's storage is not sending CORS headers, so its final frame cannot be read in the browser. Enable public read access on the storage bucket and try again.";
      case "blank":
        return "This clip ends on black, so its final frame is not usable as an opening frame. Try continuing from a different clip.";
      case "load":
        return `This clip could not be opened for frame extraction. ${error.message}`;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : "The final frame could not be extracted.";
}
