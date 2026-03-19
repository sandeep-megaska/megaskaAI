import { type SafeMotionLevel, type VideoProviderCapability } from "@/lib/video/providerCapabilities";

const MOTION_ORDER: SafeMotionLevel[] = ["minimal", "moderate", "dynamic"];

function clampMotionToProvider(level: SafeMotionLevel, capability: VideoProviderCapability): SafeMotionLevel {
  const providerIndex = MOTION_ORDER.indexOf(capability.safeMotionLevel);
  const levelIndex = MOTION_ORDER.indexOf(level);
  return MOTION_ORDER[Math.min(providerIndex, levelIndex)];
}

export function downgradeMotionLevel(level: SafeMotionLevel): SafeMotionLevel {
  if (level === "dynamic") return "moderate";
  if (level === "moderate") return "minimal";
  return "minimal";
}

export function resolveFallbackMotionLevel(input: {
  requested: SafeMotionLevel;
  capability: VideoProviderCapability;
  fallbackIndex: number;
}) {
  let motion = clampMotionToProvider(input.requested, input.capability);
  for (let i = 0; i < input.fallbackIndex; i += 1) {
    motion = downgradeMotionLevel(motion);
  }
  return motion;
}
