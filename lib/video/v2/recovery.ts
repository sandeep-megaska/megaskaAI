import type { PackReadinessReport, RecoveryRecommendation, V2Mode, VideoRunHistoryRecord } from "@/lib/video/v2/types";

function modeLevel(report: PackReadinessReport | null, mode: V2Mode) {
  return report?.modeSuitability.find((entry) => entry.mode === mode)?.level ?? "insufficient";
}

function isValidationWeak(run: VideoRunHistoryRecord) {
  if (!run.validation) return false;
  return run.validation.decision === "retry" || run.validation.decision === "reject" || run.validation.decision === "manual_review";
}

export function buildRecoveryRecommendation(input: {
  run: VideoRunHistoryRecord;
  packReadiness: PackReadinessReport | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
}): RecoveryRecommendation {
  const { run, packReadiness, fallbackProvider, fallbackModel } = input;
  const failed = run.status === "failed";
  const weakValidation = isValidationWeak(run);
  const passedValidation = run.validation?.decision === "pass";
  const hasPackIssues = Boolean(packReadiness && (!packReadiness.isReady || packReadiness.missingRoles.length > 0 || packReadiness.riskLevel === "high"));
  const providerFailure = (run.failure_message ?? "").toLowerCase().includes("provider");
  const frameModeWeak = run.mode_selected === "frames_to_video" && modeLevel(packReadiness, "ingredients_to_video") !== "insufficient";

  const reasons: string[] = [];
  if (failed) reasons.push("Run status is failed.");
  if (weakValidation) reasons.push(`Validation weakness (${run.validation?.decision}).`);
  if (providerFailure) reasons.push("Provider failure detected.");
  if (hasPackIssues) reasons.push("Pack issue detected (missing requirements, low readiness, or high risk).");

  const canRetryBase = failed || weakValidation;
  const canRetrySamePlan = canRetryBase && !hasPackIssues && !passedValidation;
  const canRetryFallback = canRetryBase && !hasPackIssues && Boolean(fallbackProvider || fallbackModel) && !passedValidation;
  const canRetrySaferMode = canRetryBase && !passedValidation && Boolean(frameModeWeak);
  const shouldImproveAnchorsFirst = hasPackIssues;

  let primaryRecommendation = "No retry recommended";
  if (shouldImproveAnchorsFirst) primaryRecommendation = "Improve anchors before retry";
  else if (canRetryFallback && providerFailure) primaryRecommendation = "Retry with fallback model/provider";
  else if (canRetrySaferMode) primaryRecommendation = "Retry with safer mode";
  else if (canRetrySamePlan) primaryRecommendation = "Retry same plan";

  const recommendedActions: string[] = [];
  if (canRetrySamePlan) recommendedActions.push("retry_same_plan");
  if (canRetryFallback) recommendedActions.push("retry_fallback");
  if (canRetrySaferMode) recommendedActions.push("retry_safer_mode");
  if (shouldImproveAnchorsFirst) recommendedActions.push("improve_anchors");

  const suggestedSaferMode: V2Mode | null =
    run.mode_selected === "frames_to_video" && modeLevel(packReadiness, "ingredients_to_video") !== "insufficient" ? "ingredients_to_video" : null;

  return {
    primary_recommendation: primaryRecommendation,
    recommended_actions: recommendedActions,
    reasons: reasons.length ? reasons : ["No deterministic recovery action required."],
    can_retry_same_plan: canRetrySamePlan,
    can_retry_fallback: canRetryFallback,
    can_retry_safer_mode: canRetrySaferMode,
    should_improve_anchors_first: shouldImproveAnchorsFirst,
    suggested_fallback_provider: fallbackProvider,
    suggested_fallback_model: fallbackModel,
    suggested_safer_mode: suggestedSaferMode,
    action_availability: {
      retry_same_plan: {
        allowed: canRetrySamePlan,
        reason: canRetrySamePlan ? "Eligible due to failed/weak run and healthy pack." : "Not eligible for deterministic same-plan retry.",
      },
      retry_fallback: {
        allowed: canRetryFallback,
        reason: canRetryFallback ? "Fallback provider/model available for supervised retry." : "No approved fallback configured or retry not needed.",
      },
      retry_safer_mode: {
        allowed: canRetrySaferMode,
        reason: canRetrySaferMode ? "Safer mode is suitable for current pack and outcome." : "No suitable safer mode available.",
      },
      improve_anchors: {
        allowed: shouldImproveAnchorsFirst,
        reason: shouldImproveAnchorsFirst ? "Pack readiness risks detected; improve anchors first." : "Pack quality is not blocking retry.",
      },
    },
  };
}

