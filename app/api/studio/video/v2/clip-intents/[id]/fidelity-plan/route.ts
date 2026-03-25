import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";

type ClipIntentRow = {
  id: string;
  motion_prompt: string;
  aspect_ratio: string;
  duration_seconds: number;
};

type WorkingPackRow = {
  id: string;
};

type WorkingPackItemRow = {
  role: string;
  source_kind: "reused" | "synthesized" | "derived";
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const supabase = getSupabaseAdminClient();
    const { data: intent, error: intentError } = await supabase
      .from("clip_intents")
      .select("id,motion_prompt,aspect_ratio,duration_seconds")
      .eq("id", clipIntentId)
      .maybeSingle<ClipIntentRow>();

    if (intentError) return json(400, { success: false, error: intentError.message });
    if (!intent) return json(404, { success: false, error: "Clip intent not found." });

    const { data: pack } = await supabase
      .from("working_packs")
      .select("id")
      .eq("clip_intent_id", clipIntentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<WorkingPackRow>();

    const { data: items, error: itemsError } = pack
      ? await supabase
          .from("working_pack_items")
          .select("role,source_kind")
          .eq("working_pack_id", pack.id)
          .order("sort_order", { ascending: true })
      : { data: [], error: null as { message: string } | null };

    if (itemsError) return json(400, { success: false, error: itemsError.message });

    const roleSources = ((items ?? []) as WorkingPackItemRow[]).reduce<Partial<Record<string, "reused" | "synthesized" | "derived">>>(
      (acc, item) => {
        acc[item.role] = item.source_kind;
        return acc;
      },
      {},
    );

    const plan = planCreativeFidelity({
      prompt: intent.motion_prompt,
      aspect_ratio: intent.aspect_ratio,
      duration_seconds: intent.duration_seconds,
      available_roles: ((items ?? []) as WorkingPackItemRow[]).map((item) => item.role),
      role_sources: roleSources,
    });

    return json(200, {
      success: true,
      data: {
        clip_intent_id: intent.id,
        working_pack_id: pack?.id ?? null,
        plan,
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
