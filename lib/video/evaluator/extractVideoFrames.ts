import { decodeFrameToRgb, probeVideoDuration } from "@/lib/video/evaluator/ffmpegMetrics";
import { SAMPLE_FRAME_MARKERS } from "@/lib/video/evaluator/config";

export type ExtractedFrame = {
  frameLabel: "early" | "middle" | "late";
  timestampSec: number;
  pixels: Uint8Array;
  width: number;
  height: number;
};

export async function extractRepresentativeFrames(videoPath: string) {
  const diagnostics: Record<string, unknown> = { markers: SAMPLE_FRAME_MARKERS };
  const extracted: ExtractedFrame[] = [];
  const probe = await probeVideoDuration(videoPath);
  diagnostics.durationSec = probe.durationSec;

  for (const marker of SAMPLE_FRAME_MARKERS) {
    const timestampSec = Number((probe.durationSec * marker.ratio).toFixed(3));
    try {
      const decoded = await decodeFrameToRgb(videoPath, { timestampSec, width: 32, height: 32 });
      extracted.push({
        frameLabel: marker.label,
        timestampSec,
        width: decoded.width,
        height: decoded.height,
        pixels: decoded.pixels,
      });
    } catch (error) {
      diagnostics[`${marker.label}Error`] = error instanceof Error ? error.message : "unknown decode failure";
    }
  }

  diagnostics.extractedFrameCount = extracted.length;
  diagnostics.requestedFrameCount = SAMPLE_FRAME_MARKERS.length;

  return { frames: extracted, diagnostics };
}
