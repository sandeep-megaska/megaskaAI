export type GenerationMode = "protected-core" | "experimental-safe";

export type ProtectedCoreAnchorSet = {
  firstFrameUrl: string | null;
  lastFrameUrl: string | null;
  identityAnchorUrl: string | null;
};

export type ProtectedCoreFlowDecision = {
  protectedCoreFlowEnabled: true;
  generationMode: GenerationMode;
  requiredAnchors: ProtectedCoreAnchorSet;
  hasAllMandatoryAnchors: boolean;
  notes: string[];
};

/**
 * Megaska PROTECTED CORE FLOW
 * - firstAnchor (first frame) is mandatory for protected fidelity path
 * - lastAnchor (last frame) is mandatory for protected fidelity path
 * - identityAnchor is mandatory for protected fidelity path
 *
 * This helper is intentionally additive/non-destructive: if legacy inputs omit one of
 * these anchors, the caller can still decide whether to reject or run a compatibility
 * fallback. The mandatory contract is centralized here so experiments cannot silently
 * weaken core behavior.
 */
export function resolveProtectedCoreFlow(input: {
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  identityAnchorUrl?: string | null;
  experimentalToggleUsed?: boolean;
}): ProtectedCoreFlowDecision {
  const requiredAnchors: ProtectedCoreAnchorSet = {
    firstFrameUrl: input.firstFrameUrl?.trim() || null,
    lastFrameUrl: input.lastFrameUrl?.trim() || null,
    identityAnchorUrl: input.identityAnchorUrl?.trim() || null,
  };

  const missing = [
    requiredAnchors.firstFrameUrl ? null : "firstAnchor(firstFrame)",
    requiredAnchors.lastFrameUrl ? null : "lastAnchor(lastFrame)",
    requiredAnchors.identityAnchorUrl ? null : "identityAnchor",
  ].filter((value): value is string => Boolean(value));

  const notes =
    missing.length > 0
      ? [
          `Protected core mandatory anchors missing: ${missing.join(", ")}.`,
          "Compatibility fallback may be used, but protected anchor contract remains the production default.",
        ]
      : ["Protected core mandatory anchors satisfied."];

  return {
    protectedCoreFlowEnabled: true,
    generationMode: input.experimentalToggleUsed ? "experimental-safe" : "protected-core",
    requiredAnchors,
    hasAllMandatoryAnchors: missing.length === 0,
    notes,
  };
}
