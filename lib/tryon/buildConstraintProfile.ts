import { ConstraintProfile, TryOnConstraintMap } from "@/lib/tryon/types";

function toBoolean(value: string | boolean | null | undefined, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function toEnum<T extends string>(value: string | boolean | null | undefined, allowed: T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function buildConstraintProfile(constraints: TryOnConstraintMap): ConstraintProfile {
  const fitMode = toEnum(constraints.fit_mode, ["strict", "balanced", "relaxed"], "balanced");
  const compositionMode = toEnum(constraints.composition_mode, ["studio", "catalog", "campaign", "social"], "studio");

  const profile: ConstraintProfile = {
    preservePrint: toBoolean(constraints.preserve_print, true),
    preserveNeckline: toBoolean(constraints.preserve_neckline, true),
    preserveSleeveShape: toBoolean(constraints.preserve_sleeve_shape, true),
    preserveLength: toBoolean(constraints.preserve_length, true),
    preserveCoverage: toBoolean(constraints.preserve_coverage, true),
    preserveColor: toBoolean(constraints.preserve_color, true),
    allowPoseChange: toBoolean(constraints.allow_pose_change, true),
    allowBackgroundChange: toBoolean(constraints.allow_background_change, true),
    allowStylingVariation: toBoolean(constraints.allow_styling_variation, false),
    fitMode,
    compositionMode,
    allowedVariationLevel: "low",
    preservationPriority: [],
    compositionIntent: compositionMode === "studio" ? "catalog" : compositionMode,
    rawConstraints: constraints,
  };

  const preservationPriority = [
    "silhouette",
    profile.preserveCoverage ? "coverage" : null,
    profile.preserveLength ? "length" : null,
    profile.preserveNeckline ? "neckline" : null,
    profile.preserveSleeveShape ? "sleeve_or_strap" : null,
    profile.preservePrint ? "print" : null,
    profile.preserveColor ? "colorway" : null,
  ].filter((value): value is string => Boolean(value));

  let variationLevel: ConstraintProfile["allowedVariationLevel"] = "medium";
  if (!profile.allowStylingVariation || fitMode === "strict") variationLevel = "low";
  if (profile.allowStylingVariation && fitMode === "relaxed" && profile.allowPoseChange && profile.allowBackgroundChange) {
    variationLevel = "high";
  }

  return {
    ...profile,
    allowedVariationLevel: variationLevel,
    preservationPriority,
  };
}
