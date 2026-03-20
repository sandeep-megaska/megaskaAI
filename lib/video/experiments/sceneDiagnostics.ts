export type SceneMismatchRisk = "low" | "medium" | "high";

type SceneClass = "indoor" | "outdoor" | "water" | "mixed" | "unknown";

type SceneGuess = {
  family: string;
  class: SceneClass;
  keywords: string[];
};

export type SceneDiagnosticsResult = {
  promptSceneIntent: SceneGuess;
  anchorSceneGuess: SceneGuess;
  sceneMismatchRisk: SceneMismatchRisk;
  sceneMismatchNotes: string[];
  sceneDiagnosticsVersion: string;
};

const SCENE_DIAGNOSTICS_VERSION = "scene-diagnostics-v1";

const SCENE_RULES: Array<{ family: string; class: SceneClass; keywords: string[] }> = [
  { family: "beach", class: "outdoor", keywords: ["beach", "shore", "shoreline", "seaside", "sand"] },
  { family: "poolside", class: "outdoor", keywords: ["pool", "poolside"] },
  { family: "underwater", class: "water", keywords: ["underwater", "under water", "submerged", "diving"] },
  { family: "bedroom", class: "indoor", keywords: ["bedroom", "bed", "suite", "hotel room"] },
  { family: "kitchen", class: "indoor", keywords: ["kitchen", "sink", "dish"] },
  { family: "bathroom", class: "indoor", keywords: ["bathroom", "vanity", "washroom"] },
  { family: "studio", class: "indoor", keywords: ["studio", "set"] },
  { family: "street", class: "outdoor", keywords: ["street", "road", "outdoor"] },
];

function inferSceneGuess(texts: string[]): SceneGuess {
  const normalized = texts.join(" ").toLowerCase();
  const matches = SCENE_RULES
    .map((rule) => ({ rule, hits: rule.keywords.filter((keyword) => normalized.includes(keyword)) }))
    .filter((entry) => entry.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

  if (!matches.length) {
    return {
      family: "general",
      class: normalized.includes("indoor") ? "indoor" : normalized.includes("outdoor") ? "outdoor" : "unknown",
      keywords: [],
    };
  }

  const top = matches[0];
  const classes = Array.from(new Set(matches.map((entry) => entry.rule.class)));

  return {
    family: top.rule.family,
    class: classes.length > 1 ? "mixed" : top.rule.class,
    keywords: Array.from(new Set(matches.flatMap((entry) => entry.hits))),
  };
}

export function analyzeSceneDiagnostics(input: { promptText: string; styleHint?: string | null; anchorHints?: string[] }): SceneDiagnosticsResult {
  const promptSceneIntent = inferSceneGuess([input.promptText, input.styleHint ?? ""]);
  const anchorSceneGuess = inferSceneGuess(input.anchorHints ?? []);

  const notes: string[] = [];
  let sceneMismatchRisk: SceneMismatchRisk = "low";

  if (anchorSceneGuess.class === "unknown") {
    notes.push("Anchor scene metadata unavailable; mismatch risk confidence is reduced.");
    sceneMismatchRisk = promptSceneIntent.class === "unknown" ? "low" : "medium";
  } else if (promptSceneIntent.class === "unknown") {
    notes.push("Prompt scene intent not explicit; recommend adding direct scene words.");
    sceneMismatchRisk = "medium";
  } else if (promptSceneIntent.class !== anchorSceneGuess.class) {
    sceneMismatchRisk = "high";
    notes.push(`Prompt scene class (${promptSceneIntent.class}) differs from anchor scene class (${anchorSceneGuess.class}).`);
  } else if (promptSceneIntent.family !== "general" && anchorSceneGuess.family !== "general" && promptSceneIntent.family !== anchorSceneGuess.family) {
    sceneMismatchRisk = "medium";
    notes.push(`Prompt scene family (${promptSceneIntent.family}) differs from anchor family (${anchorSceneGuess.family}).`);
  }

  if (sceneMismatchRisk === "high") {
    notes.push("Prompt scene may not match anchor scene; intro drift risk is higher.");
  }

  return {
    promptSceneIntent,
    anchorSceneGuess,
    sceneMismatchRisk,
    sceneMismatchNotes: notes,
    sceneDiagnosticsVersion: SCENE_DIAGNOSTICS_VERSION,
  };
}
