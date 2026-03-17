export type TryOnConstraintMap = Record<string, string | boolean | null | undefined>;

export type TryOnSubject = {
  sourceMode: "model_library" | "manual_upload";
  modelName?: string | null;
  personAssetUrl?: string | null;
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
  negativePrompt: string;
  instructionBundle: {
    betaNotice: string;
    sourceMode: string;
    subjectReferenceUrl?: string | null;
    garmentAssetUrls: string[];
    constraints: TryOnConstraintMap;
  };
};

export function compileTryOnPrompt(input: {
  subject: TryOnSubject;
  garment: TryOnGarmentReference;
  constraints: TryOnConstraintMap;
  prompt?: string | null;
  negativePrompt?: string | null;
  engineMode?: string | null;
}) : CompiledTryOnInstruction {
  const constraintLines = Object.entries(input.constraints)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `- ${key}: ${String(value)}`);

  const garmentContext = [
    `Garment: ${input.garment.displayName} (${input.garment.garmentCode})`,
    input.garment.category ? `Category: ${input.garment.category}` : null,
    input.garment.colorway ? `Colorway: ${input.garment.colorway}` : null,
    input.garment.printType ? `Print type: ${input.garment.printType}` : null,
    input.garment.description ? `Description: ${input.garment.description}` : null,
    input.garment.fabricNotes ? `Fabric notes: ${input.garment.fabricNotes}` : null,
    input.garment.silhouetteNotes ? `Silhouette notes: ${input.garment.silhouetteNotes}` : null,
    input.garment.coverageNotes ? `Coverage notes: ${input.garment.coverageNotes}` : null,
    `Garment reference URLs:\n${input.garment.assetUrls.map((url) => `- ${url}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const subjectContext = input.subject.sourceMode === "model_library"
    ? `Subject source: Approved model library (${input.subject.modelName ?? "Unnamed Model"}).`
    : `Subject source: Manual uploaded person reference. URL: ${input.subject.personAssetUrl ?? "(not provided)"}`;

  const prompt = [
    "Generate a realistic Megaska swimwear try-on output.",
    subjectContext,
    garmentContext,
    input.engineMode ? `Engine mode: ${input.engineMode}` : null,
    input.prompt ? `Scene prompt: ${input.prompt}` : "Scene prompt: clean studio-grade fashion output.",
    constraintLines.length ? `Structured constraints:\n${constraintLines.join("\n")}` : null,
    "Important: maintain garment fidelity where requested by constraints and preserve product details.",
    "This workflow is beta and may require human QA for perfect product fidelity.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    prompt,
    negativePrompt: input.negativePrompt?.trim() || "distorted garment details, altered print, wrong product construction",
    instructionBundle: {
      betaNotice: "Try-On Studio is beta. Always verify garment fidelity before publication.",
      sourceMode: input.subject.sourceMode,
      subjectReferenceUrl: input.subject.personAssetUrl ?? null,
      garmentAssetUrls: input.garment.assetUrls,
      constraints: input.constraints,
    },
  };
}
