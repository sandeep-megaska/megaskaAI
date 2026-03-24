const MIN_PLAYABLE_VIDEO_BYTES = 64 * 1024;

type ValidationInput = {
  provider: string;
  outputUrl: string | null;
  mimeType: string | null;
  bytesLength: number;
  durationSeconds?: number | null;
};

export type VideoOutputValidation = {
  valid: boolean;
  errorMessage: string | null;
  checks: {
    hasOutputUrl: boolean;
    retrievable: boolean;
    isVideoMime: boolean;
    aboveMinSize: boolean;
    hasPositiveDuration: boolean | null;
  };
  observed: {
    provider: string;
    contentType: string | null;
    fileSizeBytes: number;
    durationSeconds: number | null;
    minBytesRequired: number;
  };
};

export function validatePlayableVideoOutput(input: ValidationInput): VideoOutputValidation {
  const normalizedMime = input.mimeType?.trim().toLowerCase() ?? null;
  const hasOutputUrl = Boolean(input.outputUrl?.trim());
  const retrievable = Number.isFinite(input.bytesLength) && input.bytesLength > 0;
  const isVideoMime = Boolean(normalizedMime?.startsWith("video/"));
  const aboveMinSize = input.bytesLength >= MIN_PLAYABLE_VIDEO_BYTES;
  const durationKnown = typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds);
  const hasPositiveDuration = durationKnown ? (input.durationSeconds as number) > 0 : null;

  const checks = {
    hasOutputUrl,
    retrievable,
    isVideoMime,
    aboveMinSize,
    hasPositiveDuration,
  };

  const valid = hasOutputUrl && retrievable && isVideoMime && aboveMinSize && (hasPositiveDuration ?? true);

  const errorMessage = valid ? null : "Provider returned an unplayable video output.";

  return {
    valid,
    errorMessage,
    checks,
    observed: {
      provider: input.provider,
      contentType: normalizedMime,
      fileSizeBytes: input.bytesLength,
      durationSeconds: durationKnown ? (input.durationSeconds as number) : null,
      minBytesRequired: MIN_PLAYABLE_VIDEO_BYTES,
    },
  };
}
