import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

type WorkingPackRow = { id: string };
type WorkingPackItemRow = { id: string; role: string };

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const body = (await request.json().catch(() => ({}))) as {
      start_generation_id?: string;
      end_generation_id?: string | null;
      motion_prompt?: string;
      duration_seconds?: 4 | 6 | 8;
      aspect_ratio?: "9:16" | "16:9" | "1:1";
    };

    if (!body.start_generation_id?.trim()) {
      return json(400, { success: false, error: "start_generation_id is required." });
    }

    const supabase = getSupabaseAdminClient();

    const { error: intentUpdateError } = await supabase
      .from("clip_intents")
      .update({
        motion_prompt: body.motion_prompt?.trim() || undefined,
        duration_seconds: body.duration_seconds,
        aspect_ratio: body.aspect_ratio,
      })
      .eq("id", clipIntentId);

    if (intentUpdateError) return json(400, { success: false, error: intentUpdateError.message });

    const { data: packs, error: packsError } = await supabase
      .from("working_packs")
      .select("id")
      .eq("clip_intent_id", clipIntentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<WorkingPackRow[]>();

    if (packsError) return json(500, { success: false, error: packsError.message });
    const workingPackId = packs?.[0]?.id;
    if (!workingPackId) return json(404, { success: false, error: "Working pack not found for clip intent." });

    const { data: items, error: itemsError } = await supabase
      .from("working_pack_items")
      .select("id,role")
      .eq("working_pack_id", workingPackId)
      .in("role", ["start_frame", "end_frame"])
      .returns<WorkingPackItemRow[]>();

    if (itemsError) return json(500, { success: false, error: itemsError.message });

    const byRole = new Map((items ?? []).map((item) => [item.role, item]));

    const upsertRole = async (role: "start_frame" | "end_frame", generationId: string) => {
      const existing = byRole.get(role);
      if (existing?.id) {
        const { error } = await supabase
          .from("working_pack_items")
          .update({ generation_id: generationId, source_kind: "user_uploaded", confidence_score: 1 })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase
        .from("working_pack_items")
        .insert({
          working_pack_id: workingPackId,
          role,
          generation_id: generationId,
          source_kind: "user_uploaded",
          confidence_score: 1,
          sort_order: role === "start_frame" ? 998 : 999,
          item_meta: {
            source: "simple_video_frame",
            generation_origin: "simple_video_frame",
          },
        });

      if (error) throw new Error(error.message);
    };

    await upsertRole("start_frame", body.start_generation_id.trim());

    if (body.end_generation_id?.trim()) {
      await upsertRole("end_frame", body.end_generation_id.trim());
    } else {
      const existingEnd = byRole.get("end_frame");
      if (existingEnd?.id) {
        const { error } = await supabase.from("working_pack_items").delete().eq("id", existingEnd.id);
        if (error) return json(500, { success: false, error: error.message });
      }
    }

    return json(200, { success: true, data: { clipIntentId, workingPackId } });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
