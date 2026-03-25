import type { FidelityTier, ParsedIntentSignals, RiskLevel, RiskSummary } from "@/lib/video/v2/creativeFidelity/types";

function toScore(level: RiskLevel) {
  return level === "high" ? 3 : level === "medium" ? 2 : 1;
}

function fromScore(score: number): RiskLevel {
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export function inferFidelityTier(signals: ParsedIntentSignals): FidelityTier {
  if (
    signals.motionComplexity === "dynamic"
    || signals.viewDependency === "high"
    || signals.garmentRisk === "high"
    || signals.sceneRisk === "high"
    || signals.surrealExposure
  ) return "high";

  if (
    signals.motionComplexity === "moderate"
    || signals.viewDependency === "medium"
    || signals.garmentRisk === "medium"
    || signals.sceneRisk === "medium"
  ) return "medium";

  return "low";
}

export function buildRiskSummary(signals: ParsedIntentSignals): RiskSummary {
  const tier = inferFidelityTier(signals);

  const aggregate = Math.max(
    toScore(signals.viewDependency),
    toScore(signals.garmentRisk),
    toScore(signals.sceneRisk),
    signals.motionComplexity === "dynamic" ? 3 : signals.motionComplexity === "moderate" ? 2 : 1,
    signals.waterExposure ? 3 : 1,
    signals.surrealExposure ? 3 : 1,
    signals.unsafeConcepts.length ? 3 : 1,
  );

  return {
    fidelityTier: tier,
    motionComplexity: signals.motionComplexity,
    viewDependency: signals.viewDependency,
    garmentRisk: signals.garmentRisk,
    sceneRisk: signals.sceneRisk,
    overallRisk: fromScore(aggregate),
    waterExposure: signals.waterExposure,
    surrealExposure: signals.surrealExposure,
    unsafeConcepts: signals.unsafeConcepts,
  };
}
