import type { MotionComplexity, ParsedIntentSignals, RiskLevel } from "@/lib/video/v2/creativeFidelity/types";

function matchAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyMotionComplexity(prompt: string): MotionComplexity {
  if (matchAny(prompt, [/\b(turn around|spin|twirl|dance|run|jump|flip|rapid camera|orbit)\b/])) return "dynamic";
  if (matchAny(prompt, [/\b(turn|walk|step|pivot|lean|reach|pose|tracking shot)\b/])) return "moderate";
  return "minimal";
}

function classifyViewDependency(prompt: string): RiskLevel {
  if (matchAny(prompt, [/\b(back view|from behind|rear view|360|full rotation|turn around)\b/])) return "high";
  if (matchAny(prompt, [/\b(three quarter|side view|slight turn|partial turn)\b/])) return "medium";
  return "low";
}

function classifyGarmentRisk(prompt: string): RiskLevel {
  if (matchAny(prompt, [/\b(flowing fabric|wet|splash|rain|underwater|spin|twirl|pose shift)\b/])) return "high";
  if (matchAny(prompt, [/\b(turn|walk|movement|sit|bend)\b/])) return "medium";
  return "low";
}

function classifySceneRisk(prompt: string): RiskLevel {
  if (matchAny(prompt, [/\b(crowd|street|ocean|river|waterfall|underwater|storm|heavy rain)\b/])) return "high";
  if (matchAny(prompt, [/\b(camera move|pan|tracking|environment change)\b/])) return "medium";
  return "low";
}

export function parseIntentSignals(motionPrompt: string): ParsedIntentSignals {
  const prompt = motionPrompt.toLowerCase();
  const hasTurningMotion = matchAny(prompt, [/\b(turn|turning|turns around|rotate|rotating|rotation|spin|spinning|twirl|twirling|pivot)\b/]);
  const hasBackReveal = matchAny(prompt, [
    /\b(show(?:s)? the back|reveal(?:s)? the back|back design|rear view|from behind|back shot|back view|turns around)\b/,
  ]);
  const hasWalkAwayMotion = matchAny(prompt, [/\b(walk away|walks away|walking away|turning away|rear exit|away from camera)\b/]);
  const hasCloseupDetail = matchAny(prompt, [/\b(close[- ]?up|macro|texture detail|fabric detail|stitch detail)\b/]);
  const waterExposure = matchAny(prompt, [/\b(water|ocean|river|rain|underwater|splash|wet)\b/]);
  const hasWaterRotation = waterExposure && (hasTurningMotion || matchAny(prompt, [/\b(jump|dive|entry|flip)\b/]));
  const surrealExposure = matchAny(prompt, [/\b(surreal|dreamlike|fantasy|impossible|levitating|shape-shift)\b/]);

  const unsafeConcepts = [
    /\b(nudity|nude|porn|explicit sex|sexual violence)\b/,
    /\b(gore|dismemberment|graphic violence|self-harm|suicide)\b/,
    /\b(illegal drugs manufacturing|terrorism instruction)\b/,
  ]
    .filter((pattern) => pattern.test(prompt))
    .map((pattern) => pattern.source.replace(/\\b/g, ""));

  return {
    motionComplexity: classifyMotionComplexity(prompt),
    viewDependency: classifyViewDependency(prompt),
    garmentRisk: classifyGarmentRisk(prompt),
    sceneRisk: classifySceneRisk(prompt),
    hasTurningMotion,
    hasBackReveal,
    hasWalkAwayMotion,
    hasCloseupDetail,
    hasWaterRotation,
    waterExposure,
    surrealExposure,
    unsafeConcepts,
  };
}
