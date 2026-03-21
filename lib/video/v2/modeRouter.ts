import { type AnchorPackItemRole, type ModeRoutingInput, type ModeRoutingResult } from "@/lib/video/v2/types";

function hasRole(roles: AnchorPackItemRole[], role: AnchorPackItemRole) {
  return roles.includes(role);
}

// Megaska AI Studio V2: deterministic router prioritizing anchor fidelity over free-form prompting.
export function routeVideoMode(input: ModeRoutingInput): ModeRoutingResult {
  const hasStartAndEnd = hasRole(input.availableRoles, "start_frame") && hasRole(input.availableRoles, "end_frame");

  if (input.priorValidatedClipExists && input.motionComplexity !== "high") {
    return {
      modeSelected: "scene_extension",
      whyModeSelected: "Prior validated clip exists and motion scope is controlled; continue validated motion timeline.",
    };
  }

  if (input.exactEndStateRequired && hasStartAndEnd && input.packStabilityScore >= 0.5) {
    return {
      modeSelected: "frames_to_video",
      whyModeSelected: "Exact end-state is required and start/end anchors are available for constrained transition control.",
    };
  }

  return {
    modeSelected: "ingredients_to_video",
    whyModeSelected:
      "Defaulting to anchor ingredients to maximize identity/garment persistence when exact end-state constraints are not dominant.",
  };
}
