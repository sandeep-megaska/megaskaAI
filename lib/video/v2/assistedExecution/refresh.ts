import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildAnchorExpansionContext } from "@/lib/video/v2/anchorExpansion/plannerBridge";
import { orchestrateClipIntent } from "@/lib/video/v2/orchestration/orchestrate";
import type { OrchestrationPlan } from "@/lib/video/v2/orchestration/types";
import type { OrchestrationSnapshots } from "@/lib/video/v2/assistedExecution/types";

type WorkingPackRow = {
  id: string;
  status: string;
  readiness_score: number | null;
};

type ClipIntentRow = {
  compiled_anchor_pack_id: string | null;
  last_compiled_at: string | null;
};

export async function refreshOrchestrationPlan(clipIntentId: string, snapshots?: OrchestrationSnapshots): Promise<OrchestrationPlan> {
  const expansionContext = await buildAnchorExpansionContext(clipIntentId);
  const supabase = getSupabaseAdminClient();

  const { data: pack, error: packError } = await supabase
    .from("working_packs")
    .select("id,status,readiness_score")
    .eq("id", expansionContext.workingPackId)
    .maybeSingle<WorkingPackRow>();

  if (packError) throw new Error(packError.message);
  if (!pack) throw new Error("Working pack not found.");

  const { data: intent, error: intentError } = await supabase
    .from("clip_intents")
    .select("compiled_anchor_pack_id,last_compiled_at")
    .eq("id", clipIntentId)
    .maybeSingle<ClipIntentRow>();

  if (intentError) throw new Error(intentError.message);
  if (!intent) throw new Error("Clip intent not found.");

  return orchestrateClipIntent({
    planner: expansionContext.planner,
    workingPack: {
      id: pack.id,
      status: pack.status,
      readinessScore: Number(pack.readiness_score ?? 0),
      roles: expansionContext.items.map((item) => item.role),
    },
    compileSnapshot: {
      compiledAnchorPackId: intent.compiled_anchor_pack_id,
      compiledAt: intent.last_compiled_at,
    },
    reuseSnapshot: snapshots?.reuseSnapshot ?? null,
    expansionSnapshot: snapshots?.expansionSnapshot ?? null,
  });
}
