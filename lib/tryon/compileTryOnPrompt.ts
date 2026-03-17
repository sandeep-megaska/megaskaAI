import {
  ConstraintProfile,
  GarmentReferenceBundle,
  HardPreservationRules,
  PrintPreservationRules,
  TryOnConstraintMap,
  WorkflowProfile,
} from "@/lib/tryon/types";

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
    garmentIdentity: string;
    hardPreservation: string;
    printFidelity: string;
    forbidden: string;
    composition: string;
    negative: string;
  };
  hardPreservationRules: HardPreservationRules;
  printPreservationRules: PrintPreservationRules;
  forbiddenTransformations: string[];
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
    workflowMode: string;
    fidelityLevel: string;
    appliedRules: string[];
  };
};

export function compileTryOnPrompt(input: {
  subject: TryOnSubject;
  garment: TryOnGarmentReference;
  constraints: TryOnConstraintMap;
  constraintProfile?: ConstraintProfile;
  referenceBundle?: GarmentReferenceBundle;
  workflowProfile: WorkflowProfile;
  hardPreservationRules: HardPreservationRules;
  printPreservationRules: PrintPreservationRules;
  forbiddenTransformations: string[];
  prompt?: string | null;
  negativePrompt?: string | null;
  engineMode?: string | null;
}): CompiledTryOnInstruction {
  const profile = input.constraintProfile;
  const appliedRules: string[] = [];

  const role = input.workflowProfile.workflowMode === "catalog_fidelity"
    ? "You are generating a Megaska catalog-fidelity try-on. Recreate the exact selected garment identity on the target subject."
    : "You are generating a Megaska swimwear beta try-on result for internal product review.";

  const subject = input.subject.sourceMode === "model_library"
    ? `Use approved model library subject: ${input.subject.modelName ?? "Unnamed Model"}.`
    : `Use manual subject reference from: ${input.subject.personAssetUrl ?? "(not provided)"}.`;

  const garmentIdentity = [
    `Garment identity target: ${input.garment.displayName} (${input.garment.garmentCode}).`,
    input.garment.category ? `Category must remain: ${input.garment.category}.` : null,
    input.garment.colorway ? `Color family target: ${input.garment.colorway}.` : null,
    input.garment.printType ? `Print family target: ${input.garment.printType}.` : null,
    input.garment.silhouetteNotes ? `Silhouette: ${input.garment.silhouetteNotes}.` : null,
    input.garment.coverageNotes ? `Coverage: ${input.garment.coverageNotes}.` : null,
    `Reference URLs:\n${input.garment.assetUrls.map((url) => `- ${url}`).join("\n")}`,
  ].filter(Boolean).join("\n");

  const hardPreservation = Object.entries(input.hardPreservationRules)
    .map(([key, value]) => `${key}: ${value ? "required" : "flexible"}`)
    .join("\n");

  const printFidelity = [
    "Preserve garment fabric identity with realistic provider constraints.",
    ...Object.entries(input.printPreservationRules).map(([key, value]) => `${key}: ${value}`),
    "Do not simplify detailed multicolor prints into low-complexity motifs.",
    "Do not convert print-dominant garments into solid-color surfaces.",
  ].join("\n");

  const forbidden = input.forbiddenTransformations.length
    ? input.forbiddenTransformations.map((item) => `- ${item}`).join("\n")
    : "- none";

  const composition = input.workflowProfile.shouldUseCatalogRules
    ? `Default to neutral ${input.workflowProfile.preferredOutputStyle} composition. Minimize styling, pose, and background variation.`
    : `Composition intent: ${profile?.compositionIntent ?? "catalog"}.`;

  const negative = [
    input.negativePrompt?.trim() || "",
    input.subject.modelNegativePrompt?.trim() || "",
    "Do not alter garment class, neckline, sleeve/strap construction, bust construction, hem length, print family, or coverage profile.",
    "Avoid solid-color conversion, print flattening, low-density pattern substitutions, and unrelated color-family shifts.",
  ].filter(Boolean).join(" ");

  if (input.workflowProfile.shouldUseCatalogRules) appliedRules.push("catalog_rules_enforced");
  if (input.workflowProfile.fidelityLevel === "hard_lock") appliedRules.push("hard_lock_enabled");
  if (input.printPreservationRules.preservePrintPattern) appliedRules.push("print_lock_enforced");

  const sections = { role, subject, garmentIdentity, hardPreservation, printFidelity, forbidden, composition, negative };

  const compiledPrompt = [
    `[ROLE]\n${sections.role}`,
    `[SUBJECT_REPLACEMENT]\n${sections.subject}${input.subject.modelPromptAnchor ? `\nModel anchor: ${input.subject.modelPromptAnchor}` : ""}`,
    `[EXACT_GARMENT_IDENTITY]\n${sections.garmentIdentity}`,
    `[HARD_PRESERVATION_RULES]\n${sections.hardPreservation}`,
    `[PRINT_FIDELITY_LOCK_RULES]\n${sections.printFidelity}`,
    `[FORBIDDEN_TRANSFORMATIONS]\n${sections.forbidden}`,
    input.referenceBundle
      ? `[REFERENCE_BUNDLE]\nSilhouette refs:\n${input.referenceBundle.silhouetteReferences.map((url) => `- ${url}`).join("\n")}\nDetail refs:\n${input.referenceBundle.detailReferences.map((url) => `- ${url}`).join("\n")}\nFabric/print refs:\n${input.referenceBundle.fabricPrintReferences.map((url) => `- ${url}`).join("\n")}`
      : null,
    `[COMPOSITION]\n${sections.composition}`,
    `[NEGATIVE_INSTRUCTIONS]\n${sections.negative}`,
    `Engine mode: ${input.engineMode ?? "fidelity"}. This strengthens instructions but does not guarantee pixel-perfect print transfer.`,
  ].filter(Boolean).join("\n\n");

  return {
    prompt: compiledPrompt,
    compiledPrompt,
    negativePrompt: negative,
    sections,
    hardPreservationRules: input.hardPreservationRules,
    printPreservationRules: input.printPreservationRules,
    forbiddenTransformations: input.forbiddenTransformations,
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
      workflowMode: input.workflowProfile.workflowMode,
      fidelityLevel: input.workflowProfile.fidelityLevel,
      appliedRules,
    },
  };
}
