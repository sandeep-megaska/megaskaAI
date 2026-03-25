import type { FidelityLevel, ParsedIntentSignals, PlannerInput, RiskDimension } from "./types";

type RiskContext = {
  signals: ParsedIntentSignals;
  input: PlannerInput;
  missingRoles: string[];
  criticalMissingRoles: string[];
  criticalRoles: string[];
  blockedSynthesisRoles: string[];
};

function toLevel(score: number): FidelityLevel {
  if (score >= 12) return "very_high";
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function scoreDimension(base: number, reasons: string[]) {
  return { score: Math.max(0, base), reasons };
}

export function scoreRiskDimensions(context: RiskContext): {
  motion: RiskDimension;
  camera: RiskDimension;
  scene: RiskDimension;
  garment: RiskDimension;
  identity: RiskDimension;
  viewDependency: RiskDimension;
  environment: RiskDimension;
  anchor: RiskDimension;
  totalRiskScore: number;
} {
  const { signals, missingRoles, criticalMissingRoles, blockedSynthesisRoles, criticalRoles } = context;

  let motionScore = 1;
  const motionReasons: string[] = [];
  if (signals.motionSignals.includes("walk")) {
    motionScore += 3;
    motionReasons.push("Walking introduces moderate pose and drape shifts.");
  }
  if (signals.motionSignals.includes("turn") || signals.motionSignals.includes("twirl_spin") || signals.motionSignals.includes("sit_stand_transition")) {
    motionScore += 7;
    motionReasons.push("Turning/twirl transitions require multi-view consistency.");
  }
  if (signals.motionSignals.includes("jump_fall") || signals.motionSignals.includes("run") || signals.motionSignals.includes("choreography")) {
    motionScore += 11;
    motionReasons.push("High-energy motion elevates deformation and identity drift risk.");
  }

  let cameraScore = 1;
  const cameraReasons: string[] = [];
  if (signals.cameraSignals.includes("slow_push_pan")) {
    cameraScore += 3;
    cameraReasons.push("Camera push/pan adds perspective variation.");
  }
  if (signals.cameraSignals.includes("orbit_parallax")) {
    cameraScore += 8;
    cameraReasons.push("Orbit/parallax shots need robust side/back anchor truth.");
  }
  if (signals.cameraSignals.includes("aggressive_cinematic")) {
    cameraScore += 11;
    cameraReasons.push("Aggressive cinematic movement increases continuity pressure.");
  }

  let sceneScore = 1;
  const sceneReasons: string[] = [];
  if (signals.sceneSignals.includes("runway") || signals.sceneSignals.includes("beach") || signals.sceneSignals.includes("river")) {
    sceneScore += 3;
    sceneReasons.push("Outdoor or runway context increases spatial complexity.");
  }
  if (signals.sceneSignals.includes("scene_transition")) {
    sceneScore += 8;
    sceneReasons.push("Scene transition increases continuity and identity pressure.");
  }
  if (signals.sceneSignals.some((signal) => ["alien_world", "fantasy_surreal", "underwater"].includes(signal))) {
    sceneScore += 11;
    sceneReasons.push("Surreal/fantasy scene introduces high recontextualization risk.");
  }

  let environmentScore = 1;
  const environmentReasons: string[] = [];
  if (signals.environmentSignals.includes("wind") || signals.environmentSignals.includes("lighting_shift")) {
    environmentScore += 4;
    environmentReasons.push("Wind/lighting changes increase visual stability demands.");
  }
  if (signals.environmentSignals.includes("water") || signals.environmentSignals.includes("splash") || signals.environmentSignals.includes("rain")) {
    environmentScore += 10;
    environmentReasons.push("Water interaction strongly increases garment deformation risk.");
  }
  if (signals.environmentSignals.includes("smoke_sand_contact")) {
    environmentScore += 6;
    environmentReasons.push("Particle contact can obscure identity and garment details.");
  }

  let garmentScore = 2;
  const garmentReasons: string[] = [];
  if (signals.garmentSignals.includes("swimwear") || signals.garmentSignals.includes("straps")) {
    garmentScore += 4;
    garmentReasons.push("Swimwear/strap-driven garments are sensitive to motion drift.");
  }
  if (signals.garmentSignals.includes("flowing_layer")) {
    garmentScore += 6;
    garmentReasons.push("Layered/flowing garments are sensitive to wind and jump motion.");
  }
  if (signals.garmentSignals.includes("back_design")) {
    garmentScore += 7;
    garmentReasons.push("Back-design reveal requires strict garment truth on rear view.");
  }
  if (signals.garmentSignals.includes("texture")) {
    garmentScore += 5;
    garmentReasons.push("Texture-focused shots require high detail consistency.");
  }

  let identityScore = 1;
  const identityReasons: string[] = [];
  if (signals.viewSignals.includes("rotation") || signals.cameraSignals.includes("orbit_parallax")) {
    identityScore += 6;
    identityReasons.push("Large angle changes increase identity retention difficulty.");
  }
  if (signals.sceneSignals.some((signal) => ["fantasy_surreal", "alien_world", "scene_transition"].includes(signal))) {
    identityScore += 6;
    identityReasons.push("Stylized scene pressure increases identity drift risk.");
  }
  if (signals.motionSignals.includes("jump_fall") || signals.motionSignals.includes("run")) {
    identityScore += 4;
    identityReasons.push("Fast body transitions challenge facial identity persistence.");
  }

  let viewScore = 1;
  const viewReasons: string[] = [];
  const requiredViewCount = criticalRoles.filter((role) => role !== "fit_anchor" && role !== "front").length;
  viewScore += requiredViewCount * 2;
  if (requiredViewCount > 0) viewReasons.push("Prompt requires multiple non-frontal views.");
  if (missingRoles.length > 0) {
    viewScore += Math.min(6, missingRoles.length * 2);
    viewReasons.push(`Missing required view roles: ${missingRoles.join(", ")}.`);
  }

  let anchorScore = 1;
  const anchorReasons: string[] = [];
  if (missingRoles.length) {
    anchorScore += Math.min(8, missingRoles.length * 2);
    anchorReasons.push(`Required anchors are missing: ${missingRoles.join(", ")}.`);
  }
  if (criticalMissingRoles.length) {
    anchorScore += 12;
    anchorReasons.push(`Critical anchors are missing: ${criticalMissingRoles.join(", ")}.`);
  }
  if (blockedSynthesisRoles.length) {
    anchorScore += 14;
    anchorReasons.push(`Synthesized anchors cannot be used for critical roles: ${blockedSynthesisRoles.join(", ")}.`);
  }

  if (signals.motionSignals.includes("jump_fall") && signals.environmentSignals.includes("water")) {
    motionScore += 2;
    garmentScore += 3;
    environmentScore += 2;
    motionReasons.push("Water-entry jump escalates motion volatility.");
  }

  if ((signals.motionSignals.includes("turn") || signals.viewSignals.includes("rotation")) && !context.input.available_roles.includes("back")) {
    anchorScore += 8;
    viewScore += 4;
    anchorReasons.push("Turning shot without back anchor sharply increases fidelity failure risk.");
  }

  if (signals.sceneSignals.some((signal) => ["alien_world", "fantasy_surreal", "scene_transition"].includes(signal)) && !context.input.available_roles.includes("three_quarter_left")) {
    anchorScore += 5;
    identityScore += 2;
    anchorReasons.push("Surreal scene without side anchors increases identity drift risk.");
  }

  if (signals.garmentSignals.includes("back_design") && !context.input.available_roles.includes("back")) {
    anchorScore += 10;
    garmentScore += 3;
    anchorReasons.push("Back-reveal garment request is unsafe without back truth anchor.");
  }

  if (signals.garmentSignals.includes("flowing_layer") && signals.motionSignals.includes("jump_fall") && signals.environmentSignals.includes("wind")) {
    garmentScore += 4;
    garmentReasons.push("Layered garment + jump + wind is highly deformation-sensitive.");
  }

  const dimensions = {
    motion: scoreDimension(motionScore, motionReasons),
    camera: scoreDimension(cameraScore, cameraReasons),
    scene: scoreDimension(sceneScore, sceneReasons),
    garment: scoreDimension(garmentScore, garmentReasons),
    identity: scoreDimension(identityScore, identityReasons),
    viewDependency: scoreDimension(viewScore, viewReasons),
    environment: scoreDimension(environmentScore, environmentReasons),
    anchor: scoreDimension(anchorScore, anchorReasons),
  };

  const totalRiskScore =
    dimensions.motion.score +
    dimensions.camera.score +
    dimensions.scene.score +
    dimensions.garment.score +
    dimensions.identity.score +
    dimensions.viewDependency.score +
    dimensions.environment.score +
    dimensions.anchor.score;

  return {
    motion: { ...dimensions.motion, level: toLevel(dimensions.motion.score) },
    camera: { ...dimensions.camera, level: toLevel(dimensions.camera.score) },
    scene: { ...dimensions.scene, level: toLevel(dimensions.scene.score) },
    garment: { ...dimensions.garment, level: toLevel(dimensions.garment.score) },
    identity: { ...dimensions.identity, level: toLevel(dimensions.identity.score) },
    viewDependency: { ...dimensions.viewDependency, level: toLevel(dimensions.viewDependency.score) },
    environment: { ...dimensions.environment, level: toLevel(dimensions.environment.score) },
    anchor: { ...dimensions.anchor, level: toLevel(dimensions.anchor.score) },
    totalRiskScore,
  };
}
