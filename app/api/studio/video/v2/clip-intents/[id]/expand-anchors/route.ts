import { NextRequest, NextResponse } from "next/server";
import { buildAnchorExpansionContext } from "@/lib/video/v2/anchorExpansion/plannerBridge";
import { expandMissingAnchors } from "@/lib/video/v2/anchorExpansion/expand";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const body = (await request.json().catch(() => ({}))) as { roles?: string[] };
    const requestedRoles = Array.isArray(body.roles) ? body.roles.filter((role): role is string => typeof role === "string") : undefined;

    const expansionContext = await buildAnchorExpansionContext(clipIntentId);
    const result = await expandMissingAnchors(expansionContext, requestedRoles);

    return json(200, {
      success: true,
      data: result,
      planner: {
        decision: expansionContext.planner.decision,
        missing_roles: expansionContext.planner.missingRoles,
        critical_missing_roles: expansionContext.planner.criticalMissingRoles,
        reasons: expansionContext.planner.reasons,
      },
    });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
