import { ConstraintProfile, GarmentReferenceBundle, TryOnConstraintMap } from "@/lib/tryon/types";

export type TryOnSubject = {
  sourceMode: "model_library" | "manual_upload";
  modelName?: string | null;
  personAssetUrl?: string | null;
  modelPromptAnchor?: string | null;
  modelNegativePrompt?: string | null;
};

export type TryOnGarmentReference = {
  garmentCode: string;
  displayName: string;
  category?: string | null;
  colorway?: string | null;
  printType?: string | null;
  description?: string | null;
  fabricNotes?: string | null;
  silhouetteNotes?: string | null;
  coverageNotes?: string | null;
  assetUrls: string[];
};

export type CompiledTryOnInstruction = {
  prompt: string;
  compiledPrompt: string;
  negativePrompt: string;
  sections: {
    role: string;
    subject: string;
    garmentTruth: string;
    preservation: string;
    variation: string;
    scene: string;
    negatives: string;
  };
  instructionBundle: {
    betaNotice: string;
    sourceMode: string;
    subjectReferenceUrl?: string | null;
    garmentAssetUrls: string[];
    constraints: TryOnConstraintMap;
    preservationPriority: string[];
  };
  debug: {
    preservationPriority: string[];
    appliedRules: string[];
    omittedRules: string[];
  };
};

export function compileTryOnPrompt(input: {
  subject: TryOnSubject;
  garment: TryOnGarmentReference;
  constraints: TryOnConstraintMap;
  constraintProfile?: ConstraintProfile;
  referenceBundle?: GarmentReferenceBundle;
  prompt?: string | null;
  negativePrompt?: string | null;
  engineMode?: string | null;
}): CompiledTryOnInstruction {
  const profile = input.constraintProfile;
  const appliedRules: string[] = [];
  const omittedRules: string[] = [];

  const role = "You are generating a Megaska swimwear beta try-on result for internal product review. Preserve garment truth over stylistic novelty.";

  const subject = input.subject.sourceMode === "model_library"
    ? `Use approved model library subject: ${input.subject.modelName ?? "Unnamed Model"}.`
    : `Use manual subject reference from: ${input.subject.personAssetUrl ?? "(not provided)"}.`;

  const garmentTruth = [
    `Garment truth: ${input.garment.displayName} (${input.garment.garmentCode}).`,
    input.garment.category ? `Category: ${input.garment.category}.` : null,
    input.garment.colorway ? `Colorway target: ${input.garment.colorway}.` : null,
    input.garment.printType ? `Print type target: ${input.garment.printType}.` : null,
    input.garment.description ? `Description: ${input.garment.description}.` : null,
    input.garment.fabricNotes ? `Fabric notes: ${input.garment.fabricNotes}.` : null,
    input.garment.silhouetteNotes ? `Silhouette notes: ${input.garment.silhouetteNotes}.` : null,
    input.garment.coverageNotes ? `Coverage notes: ${input.garment.coverageNotes}.` : null,
    `Reference URLs:\n${input.garment.assetUrls.map((url) => `- ${url}`).join("\n")}`,
  ].filter(Boolean).join("\n");

  const preservation = [
    `Preservation priorities: ${(profile?.preservationPriority ?? ["silhouette", "construction", "colorway"]).join(", ")}.`,
    profile?.preservePrint ? "Preserve print placement and scale as closely as references allow." : null,
    profile?.preserveNeckline ? "Preserve neckline geometry." : null,
    profile?.preserveSleeveShape ? "Preserve sleeve or strap behavior." : null,
    profile?.preserveLength ? "Preserve hem and relative garment length." : null,
    profile?.preserveCoverage ? "Preserve coverage style and cut." : null,
    profile?.preserveColor ? "Preserve colorway and tone balance." : null,
  ].filter(Boolean).join("\n");

  if (profile?.allowedVariationLevel === "low") {
    appliedRules.push("variation_clamped_low");
  } else {
    appliedRules.push("variation_flexible");
  }

  const variation = `Allowed creative variation: ${profile?.allowedVariationLevel ?? "low"}. Keep identity and silhouette stable; avoid pixel-perfect claims.`;
  const scene = input.prompt?.trim()
    ? `Scene/composition direction: ${input.prompt.trim()}`
    : `Scene/composition direction: clean ${profile?.compositionIntent ?? "catalog"} presentation with product clarity.`;

  if (input.subject.modelPromptAnchor) {
    appliedRules.push("model_prompt_anchor_applied");
  } else {
    omittedRules.push("model_prompt_anchor_missing");
  }

  const negatives = [
    input.negativePrompt?.trim() || "",
    input.subject.modelNegativePrompt?.trim() || "",
    "Avoid wrong neckline, wrong print mapping, wrong length, wrong coverage, anatomy distortions, and unrealistic garment seams.",
  ].filter(Boolean).join(" ");

  const sections = { role, subject, garmentTruth, preservation, variation, scene, negatives };

  const compiledPrompt = [
    `[ROLE]\n${sections.role}`,
    `[SUBJECT]\n${sections.subject}${input.subject.modelPromptAnchor ? `\nModel anchor: ${input.subject.modelPromptAnchor}` : ""}`,
    `[GARMENT_TRUTH]\n${sections.garmentTruth}`,
    `[PRESERVATION]\n${sections.preservation}`,
    input.referenceBundle ? `[REFERENCE_BUNDLE]\nSilhouette refs:\n${input.referenceBundle.silhouetteReferences.map((url) => `- ${url}`).join("\n")}\nDetail refs:\n${input.referenceBundle.detailReferences.map((url) => `- ${url}`).join("\n")}` : null,
    `[ALLOWED_VARIATION]\n${sections.variation}`,
    `[SCENE]\n${sections.scene}`,
    `[NEGATIVE_AVOIDANCE]\n${sections.negatives}`,
    `Engine mode: ${input.engineMode ?? "fidelity"}.`,
    "This try-on workflow is beta; output should support internal QA review.",
  ].filter(Boolean).join("\n\n");

  return {
    prompt: compiledPrompt,
    compiledPrompt,
    negativePrompt: negatives,
    sections,
    instructionBundle: {
      betaNotice: "Try-On Studio is beta. Always verify garment fidelity before publication.",
      sourceMode: input.subject.sourceMode,
      subjectReferenceUrl: input.subject.personAssetUrl ?? null,
      garmentAssetUrls: input.garment.assetUrls,
      constraints: input.constraints,
      preservationPriority: profile?.preservationPriority ?? [],
    },
    debug: {
      preservationPriority: profile?.preservationPriority ?? [],
      appliedRules,
      omittedRules,
    },
  };
}
