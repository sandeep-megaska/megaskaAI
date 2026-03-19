import { type VideoProviderCapability } from "@/lib/video/providerCapabilities";
import { resolveFallbackMotionLevel } from "@/lib/video/resolveFallbackMotion";
import { type SafeMotionLevel } from "@/lib/video/providerCapabilities";

export type VideoRequestVariant = {
  label: string;
  complexityTier: 1 | 2 | 3 | 4 | 5 | 6;
  firstFrameUrl: string;
  lastFrameUrl: string | null;
  referenceImageUrls: string[];
  actualMotionLevel: SafeMotionLevel;
  fallbackIndex: number;
};

export type BuildVideoVariantsInput = {
  capability: VideoProviderCapability;
  firstFrameUrl: string;
  lastFrameUrl?: string | null;
  referenceImageUrls: string[];
  requestedMotionLevel: SafeMotionLevel;
};

export function buildVideoVariants(input: BuildVideoVariantsInput): VideoRequestVariant[] {
  const allowsLastFrame = input.capability.supportsLastFrame && Boolean(input.lastFrameUrl);
  const maxRefs = input.capability.supportsReferenceImages ? input.capability.maxReferenceImages : 0;
  const references = input.referenceImageUrls.slice(0, maxRefs);

  const candidates: Array<Omit<VideoRequestVariant, "actualMotionLevel" | "fallbackIndex">> = [];

  if (allowsLastFrame) {
    if (references.length >= 2) {
      candidates.push({ label: "source+last+2refs", complexityTier: 6, firstFrameUrl: input.firstFrameUrl, lastFrameUrl: input.lastFrameUrl ?? null, referenceImageUrls: references.slice(0, 2) });
    }
    if (references.length >= 1) {
      candidates.push({ label: "source+last+1ref", complexityTier: 5, firstFrameUrl: input.firstFrameUrl, lastFrameUrl: input.lastFrameUrl ?? null, referenceImageUrls: references.slice(0, 1) });
    }
    candidates.push({ label: "source+last", complexityTier: 4, firstFrameUrl: input.firstFrameUrl, lastFrameUrl: input.lastFrameUrl ?? null, referenceImageUrls: [] });
  }

  if (references.length >= 2) {
    candidates.push({ label: "source+2refs", complexityTier: 3, firstFrameUrl: input.firstFrameUrl, lastFrameUrl: null, referenceImageUrls: references.slice(0, 2) });
  }
  if (references.length >= 1) {
    candidates.push({ label: "source+1ref", complexityTier: 2, firstFrameUrl: input.firstFrameUrl, lastFrameUrl: null, referenceImageUrls: references.slice(0, 1) });
  }
  candidates.push({ label: "source-only", complexityTier: 1, firstFrameUrl: input.firstFrameUrl, lastFrameUrl: null, referenceImageUrls: [] });

  const unique = candidates.filter((candidate, index, list) => {
    return index === list.findIndex((item) => item.label === candidate.label);
  });

  return unique.map((candidate, index) => ({
    ...candidate,
    fallbackIndex: index,
    actualMotionLevel: resolveFallbackMotionLevel({
      requested: input.requestedMotionLevel,
      capability: input.capability,
      fallbackIndex: index,
    }),
  }));
}
