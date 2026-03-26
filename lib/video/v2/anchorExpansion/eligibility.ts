import type { AnchorExpansionContext, ExpansionEligibility } from "@/lib/video/v2/anchorExpansion/types";

const COMPLEX_GARMENT_PATTERNS = /(layered|strappy|straps|lace[- ]?up|open[- ]?back|cut[- ]?out|sheer|asymmetric|draped|multi[- ]?panel)/i;

function hasRealRole(context: AnchorExpansionContext, role: string) {
  return context.items.some((item) => item.role === role && item.generation_id && item.source_kind !== "synthesized");
}


function hasVerifiedRole(context: AnchorExpansionContext, role: string) {
  return context.items.some((item) =>
    item.role === role && item.generation_id && (item.source_kind === "sku_verified_truth" || item.source_kind === "manual_verified_override"),
  );
}

function averageRealConfidence(context: AnchorExpansionContext) {
  const real = context.items.filter((item) => item.generation_id && item.source_kind !== "synthesized");
  if (!real.length) return 0;
  return real.reduce((sum, item) => sum + Number(item.confidence_score ?? 0), 0) / real.length;
}

export function evaluateExpansionEligibility(context: AnchorExpansionContext, role: string): ExpansionEligibility {
  const blockers: string[] = [];

  if (hasVerifiedRole(context, role)) {
    return {
      role,
      eligible_for_expansion: false,
      eligibility_reason: "Verified role truth already exists; expansion is not allowed.",
      confidence_level: "high",
      blockers: ["verified truth already present"],
    };
  }
  const avgConfidence = averageRealConfidence(context);
  const sourceTruthCount = 1 + (context.sourceProfile.additional_generation_ids?.length ?? 0);
  const notes = `${context.sourceProfile.garment_notes ?? ""} ${context.motionPrompt}`;
  const complexGarment = COMPLEX_GARMENT_PATTERNS.test(notes);
  const plannerBlockedForBackTruth = context.planner.reasons.some((reason) =>
    /no real back anchor|rear-view truth|back view is required/i.test(reason),
  );

  const hasFront = hasRealRole(context, "front");
  const hasFit = hasRealRole(context, "fit_anchor");
  const hasDetail = hasRealRole(context, "detail");

  if (role === "back") {
    if (!hasFront) blockers.push("front truth is missing");
    if (!hasFit) blockers.push("fit anchor truth is missing");
    if (complexGarment && !hasDetail) blockers.push("garment complexity is high but no detail truth exists");
    if (plannerBlockedForBackTruth && avgConfidence < 0.72) blockers.push("planner indicates rear truth insufficiency and confidence is low");
    if (sourceTruthCount < 2 && avgConfidence < 0.7) blockers.push("insufficient multi-view source truth for reliable back reconstruction");

    if (!blockers.length && avgConfidence >= 0.82 && sourceTruthCount >= 2 && !complexGarment) {
      return { role, eligible_for_expansion: true, eligibility_reason: "Strong front/fit truth and multi-reference profile allow controlled back expansion.", confidence_level: "high", blockers };
    }

    if (!blockers.length && avgConfidence >= 0.68) {
      return { role, eligible_for_expansion: true, eligibility_reason: "Back expansion is possible with moderate confidence from available truth anchors.", confidence_level: "medium", blockers };
    }

    if (!blockers.length) blockers.push("overall reference confidence is too low for reliable back truth generation");
    return { role, eligible_for_expansion: false, eligibility_reason: "Back anchor expansion is not safe with current truth quality.", confidence_level: "low", blockers };
  }

  if (role === "three_quarter_left" || role === "three_quarter_right" || role === "three_quarter_side") {
    if (!hasFront) blockers.push("front truth is missing");
    if (!hasFit) blockers.push("fit anchor truth is missing");
    if (avgConfidence < 0.6) blockers.push("reference confidence is too low for stable side-view generation");

    if (!blockers.length) {
      return {
        role,
        eligible_for_expansion: true,
        eligibility_reason: "Side-view expansion is supported by front + fit truth.",
        confidence_level: avgConfidence >= 0.8 ? "high" : "medium",
        blockers,
      };
    }

    return { role, eligible_for_expansion: false, eligibility_reason: "Side-view expansion blocked due to weak truth support.", confidence_level: "low", blockers };
  }

  if (role === "detail") {
    if (!hasFront && !hasFit) blockers.push("detail expansion requires at least front or fit truth");
    if (avgConfidence < 0.55) blockers.push("reference confidence is too low for detail fidelity");

    if (!blockers.length) {
      return {
        role,
        eligible_for_expansion: true,
        eligibility_reason: "Detail expansion can be generated from available garment truth.",
        confidence_level: avgConfidence >= 0.78 ? "high" : "medium",
        blockers,
      };
    }

    return { role, eligible_for_expansion: false, eligibility_reason: "Detail expansion blocked due to insufficient garment truth.", confidence_level: "low", blockers };
  }

  if (role === "start_frame" || role === "end_frame") {
    if (context.planner.recommendedMode !== "frames_to_video") blockers.push("planner is not in frames_to_video mode");
    if (!hasFront || !hasFit) blockers.push("frame anchors require front and fit truth");

    if (!blockers.length) {
      return {
        role,
        eligible_for_expansion: true,
        eligibility_reason: "Frame support expansion allowed for frame-constrained compile mode.",
        confidence_level: "medium",
        blockers,
      };
    }

    return { role, eligible_for_expansion: false, eligibility_reason: "Frame support expansion is not eligible in current planner state.", confidence_level: "low", blockers };
  }

  return {
    role,
    eligible_for_expansion: false,
    eligibility_reason: "Role is not expansion-enabled in this slice.",
    confidence_level: "low",
    blockers: ["unsupported role"],
  };
}
