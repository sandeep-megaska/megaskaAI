export type IndoorOutdoorClass = "indoor" | "outdoor" | "water" | "mixed" | "unknown";
export type SceneStabilizationRisk = "low" | "medium" | "high";

export type SceneIntent = {
  sceneFamily: string;
  indoorOutdoorClass: IndoorOutdoorClass;
  lightingIntent: string | null;
  objectContextClues: string[];
  sceneKeywords: string[];
};

export type SceneStabilizationResult = {
  sceneLockEnabled: boolean;
  sceneIntent: SceneIntent;
  sceneStartState: string;
  sceneExclusions: string[];
  sceneStabilizationRisk: SceneStabilizationRisk;
  stabilizedOpeningRequired: boolean;
  sceneLockVersion: string;
  sceneLockPromptSummary: string;
  sceneLockBlock: string;
  sceneStabilizationDiagnostics: Record<string, unknown>;
};

const SCENE_LOCK_VERSION = "scene-lock-v1";

const SCENE_FAMILY_RULES: Array<{
  sceneFamily: string;
  indoorOutdoorClass: IndoorOutdoorClass;
  keywords: string[];
  objectClues?: string[];
}> = [
  { sceneFamily: "underwater", indoorOutdoorClass: "water", keywords: ["underwater", "under water", "diving", "submerged"] },
  { sceneFamily: "beach", indoorOutdoorClass: "outdoor", keywords: ["beach", "shore", "shoreline", "waves", "sand", "seaside"] },
  { sceneFamily: "poolside", indoorOutdoorClass: "outdoor", keywords: ["poolside", "pool", "by the pool"] },
  {
    sceneFamily: "luxury bedroom",
    indoorOutdoorClass: "indoor",
    keywords: ["luxury bedroom", "resort bedroom", "bedroom", "hotel bedroom", "suite bedroom"],
    objectClues: ["bed", "blanket", "pillow"],
  },
  { sceneFamily: "hotel room", indoorOutdoorClass: "indoor", keywords: ["hotel room", "luxury suite", "suite", "resort room"], objectClues: ["bed", "sofa"] },
  { sceneFamily: "kitchen", indoorOutdoorClass: "indoor", keywords: ["kitchen", "sink", "washing dishes", "dishwashing"], objectClues: ["sink", "dish", "sponge"] },
  { sceneFamily: "bathroom", indoorOutdoorClass: "indoor", keywords: ["bathroom", "changing area", "vanity", "washroom"], objectClues: ["mirror", "towel"] },
  { sceneFamily: "indoor studio", indoorOutdoorClass: "indoor", keywords: ["studio", "indoor studio", "set"] },
  { sceneFamily: "festival", indoorOutdoorClass: "outdoor", keywords: ["holi", "festival", "powder"] },
];

const LIGHTING_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /dark cinematic|cinematic dark|low[- ]key/i, label: "dark cinematic lighting" },
  { pattern: /candlelight|candle light/i, label: "warm candlelight" },
  { pattern: /night|nighttime|moonlight/i, label: "night lighting" },
  { pattern: /sunset|golden hour/i, label: "golden-hour lighting" },
  { pattern: /daylight|bright|sunny/i, label: "daylight" },
];

const SCENE_SENSITIVE_CUES = [
  "bedroom",
  "bed",
  "sleep",
  "blanket",
  "sink",
  "kitchen",
  "room",
  "indoor",
  "dark cinematic",
  "candlelight",
  "luxury suite",
  "hotel room",
  "underwater",
  "under water",
  "dining table",
  "bathroom",
  "sofa",
  "balcony interior",
];

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())));
}

function parseSceneIntent(prompt: string, styleHint?: string | null): SceneIntent {
  const normalized = `${prompt} ${styleHint ?? ""}`.toLowerCase();
  const matches = SCENE_FAMILY_RULES.filter((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)));
  const best = matches[0] ?? null;

  const objectContextClues = unique([
    ...(best?.objectClues ?? []),
    normalized.includes("bed") ? "bed" : null,
    normalized.includes("blanket") ? "blanket" : null,
    normalized.includes("sink") ? "sink" : null,
    normalized.includes("chair") ? "chair" : null,
    normalized.includes("powder") ? "powder" : null,
    normalized.includes("sofa") ? "sofa" : null,
  ]);

  const lightingIntent = LIGHTING_KEYWORDS.find((entry) => entry.pattern.test(`${prompt} ${styleHint ?? ""}`))?.label ?? null;

  if (!best) {
    return {
      sceneFamily: "general",
      indoorOutdoorClass: normalized.includes("indoor") ? "indoor" : normalized.includes("outdoor") ? "outdoor" : "unknown",
      lightingIntent,
      objectContextClues,
      sceneKeywords: [],
    };
  }

  return {
    sceneFamily: best.sceneFamily,
    indoorOutdoorClass: best.indoorOutdoorClass,
    lightingIntent,
    objectContextClues,
    sceneKeywords: best.keywords.filter((keyword) => normalized.includes(keyword)),
  };
}

function deriveSceneStartState(prompt: string, sceneIntent: SceneIntent) {
  const normalized = prompt.toLowerCase();

  if (sceneIntent.sceneFamily.includes("bedroom") || normalized.includes("sleep") || normalized.includes("bed")) {
    return "Frame 1 starts inside the bedroom with the subject already beside or on the bed and bed context clearly visible.";
  }

  if (sceneIntent.sceneFamily === "kitchen") {
    return "Frame 1 starts in the kitchen with the subject already at the sink and dishwashing context visible.";
  }

  if (sceneIntent.sceneFamily === "beach" || sceneIntent.sceneFamily === "poolside") {
    return `Frame 1 starts directly in the ${sceneIntent.sceneFamily} environment with shoreline/water context already established.`;
  }

  if (sceneIntent.sceneFamily === "underwater") {
    return "Frame 1 starts underwater with submerged environment cues immediately visible.";
  }

  return "Frame 1 starts in the requested environment with subject and key context already established before motion begins.";
}

function buildSceneExclusions(sceneIntent: SceneIntent): string[] {
  if (sceneIntent.sceneFamily.includes("bedroom") || sceneIntent.sceneFamily === "hotel room") {
    return ["beach", "poolside", "shoreline", "outdoor runway", "exterior resort walk"];
  }

  if (sceneIntent.sceneFamily === "kitchen" || sceneIntent.sceneFamily === "bathroom" || sceneIntent.indoorOutdoorClass === "indoor") {
    return ["beach", "poolside", "outdoor resort", "runway exterior"];
  }

  if (sceneIntent.sceneFamily === "underwater") {
    return ["bedroom", "beach walk intro", "kitchen", "indoor hotel room"];
  }

  if (sceneIntent.sceneFamily === "beach" || sceneIntent.sceneFamily === "poolside") {
    return ["indoor bedroom", "kitchen interior", "indoor hotel corridor"];
  }

  return [];
}

function classifySceneStabilizationRisk(prompt: string, sceneIntent: SceneIntent): SceneStabilizationRisk {
  const normalized = prompt.toLowerCase();

  if (
    sceneIntent.sceneFamily.includes("bedroom") ||
    normalized.includes("sleep") ||
    normalized.includes("cinematic indoor") ||
    normalized.includes("hotel room") ||
    normalized.includes("sitting on bed") ||
    normalized.includes("blanket")
  ) {
    return "high";
  }

  if (
    sceneIntent.sceneFamily === "kitchen" ||
    sceneIntent.sceneFamily === "festival" ||
    normalized.includes("sink") ||
    normalized.includes("indoor")
  ) {
    return "medium";
  }

  return "low";
}

function hasStrongSceneSensitiveCue(prompt: string, styleHint?: string | null) {
  const normalized = `${prompt} ${styleHint ?? ""}`.toLowerCase();
  return SCENE_SENSITIVE_CUES.some((cue) => normalized.includes(cue));
}

function buildSceneLockBlock(input: {
  sceneIntent: SceneIntent;
  sceneStartState: string;
  sceneExclusions: string[];
}) {
  const constraints = [
    `${input.sceneStartState}`,
    `Scene family: ${input.sceneIntent.sceneFamily}.`,
    `Environment class: ${input.sceneIntent.indoorOutdoorClass}.`,
    input.sceneIntent.lightingIntent ? `Lighting: ${input.sceneIntent.lightingIntent}.` : null,
    input.sceneIntent.objectContextClues.length > 0 ? `Context objects: ${input.sceneIntent.objectContextClues.join(", ")}.` : null,
    input.sceneExclusions.length > 0 ? `Exclude: ${input.sceneExclusions.join(", ")}.` : null,
    "No unrelated opening transition before requested action.",
  ];

  return constraints.filter((line): line is string => Boolean(line)).join(" ");
}

export function analyzeSceneStabilization(input: { actionPrompt: string; styleHint?: string | null }): SceneStabilizationResult {
  const diagnostics: Record<string, unknown> = {
    parserStatus: "ok",
    fallbackUsed: false,
  };

  try {
    const sceneIntent = parseSceneIntent(input.actionPrompt, input.styleHint);
    const sceneStartState = deriveSceneStartState(input.actionPrompt, sceneIntent);
    const sceneExclusions = buildSceneExclusions(sceneIntent);
    const sceneStabilizationRisk = classifySceneStabilizationRisk(input.actionPrompt, sceneIntent);
    const strongCue = hasStrongSceneSensitiveCue(input.actionPrompt, input.styleHint);
    const sceneLockEnabled = sceneStabilizationRisk !== "low" || strongCue;
    const stabilizedOpeningRequired = sceneLockEnabled;
    const sceneLockPromptSummary = `${sceneIntent.sceneFamily} | ${sceneIntent.indoorOutdoorClass} | ${sceneStabilizationRisk}`;
    const sceneLockBlock = buildSceneLockBlock({
      sceneIntent,
      sceneStartState,
      sceneExclusions,
    });

    diagnostics.strongSceneCue = strongCue;
    diagnostics.detectedKeywords = sceneIntent.sceneKeywords;

    return {
      sceneLockEnabled,
      sceneIntent,
      sceneStartState,
      sceneExclusions,
      sceneStabilizationRisk,
      stabilizedOpeningRequired,
      sceneLockVersion: SCENE_LOCK_VERSION,
      sceneLockPromptSummary,
      sceneLockBlock,
      sceneStabilizationDiagnostics: diagnostics,
    };
  } catch (error) {
    diagnostics.parserStatus = "failed";
    diagnostics.fallbackUsed = true;
    diagnostics.error = error instanceof Error ? error.message : "Unknown scene parser error";

    return {
      sceneLockEnabled: false,
      sceneIntent: {
        sceneFamily: "general",
        indoorOutdoorClass: "unknown",
        lightingIntent: null,
        objectContextClues: [],
        sceneKeywords: [],
      },
      sceneStartState: "",
      sceneExclusions: [],
      sceneStabilizationRisk: "low",
      stabilizedOpeningRequired: false,
      sceneLockVersion: SCENE_LOCK_VERSION,
      sceneLockPromptSummary: "scene parser fallback",
      sceneLockBlock: "",
      sceneStabilizationDiagnostics: diagnostics,
    };
  }
}
