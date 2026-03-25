import { NextRequest, NextResponse } from "next/server";
import { buildPackReuseContext } from "@/lib/video/v2/packReuse/plannerBridge";
import { reusePackAnchors } from "@/lib/video/v2/packReuse/reuse";

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

    const reuseContext = await buildPackReuseContext(clipIntentId);
    const result = await reusePackAnchors(reuseContext, requestedRoles);

    return json(200, {
      success: true,
      data: result,
      planner: {
        decision: reuseContext.planner.decision,
        missing_roles: reuseContext.planner.missingRoles,
        critical_missing_roles: reuseContext.planner.criticalMissingRoles,
        reasons: reuseContext.planner.reasons,
      },
    });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
