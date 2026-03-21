import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { computeItemStabilityScore, computePackStability, isPackReady } from "@/lib/video/v2/anchorPacks";
import { ANCHOR_ITEM_ROLES } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

async function recomputePack(supabase: ReturnType<typeof getSupabaseAdminClient>, packId: string) {
  const { data: pack } = await supabase.from("anchor_packs").select("id,pack_type").eq("id", packId).maybeSingle();
  const { data: items } = await supabase.from("anchor_pack_items").select("*").eq("anchor_pack_id", packId);
  if (!pack) return;

  const aggregateStability = computePackStability({ packType: pack.pack_type, items: items ?? [] });
  const ready = isPackReady({ pack_type: pack.pack_type, items: items ?? [], aggregateStability });

  await supabase
    .from("anchor_packs")
    .update({
      aggregate_stability_score: aggregateStability,
      is_ready: ready,
      status: ready ? "ready" : "draft",
    })
    .eq("id", packId);
}

export async function POST(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  try {
    const { packId } = await params;
    const body = (await request.json()) as {
      action?: "assign" | "remove" | "reorder";
      item_id?: string;
      generation_id?: string;
      role?: string;
      sort_order?: number;
      camera_signature?: string;
      lighting_signature?: string;
      pose_signature?: string;
      garment_signature?: string;
      scene_signature?: string;
      notes?: string;
      ordered_item_ids?: string[];
    };

    const supabase = getSupabaseAdminClient();

    if (body.action === "remove") {
      if (!body.item_id) return json(400, { success: false, error: "item_id is required for remove." });
      const { error } = await supabase.from("anchor_pack_items").delete().eq("id", body.item_id).eq("anchor_pack_id", packId);
      if (error) return json(400, { success: false, error: error.message });
    } else if (body.action === "reorder") {
      if (!body.ordered_item_ids?.length) return json(400, { success: false, error: "ordered_item_ids is required." });
      for (const [index, itemId] of body.ordered_item_ids.entries()) {
        await supabase.from("anchor_pack_items").update({ sort_order: index }).eq("id", itemId).eq("anchor_pack_id", packId);
      }
    } else {
      if (!body.generation_id) return json(400, { success: false, error: "generation_id is required." });
      if (!body.role || !ANCHOR_ITEM_ROLES.includes(body.role as (typeof ANCHOR_ITEM_ROLES)[number])) {
        return json(400, { success: false, error: "role is invalid." });
      }

      const computedItemScore = computeItemStabilityScore({
        camera_signature: body.camera_signature,
        lighting_signature: body.lighting_signature,
        pose_signature: body.pose_signature,
        garment_signature: body.garment_signature,
        scene_signature: body.scene_signature,
      });
      const { error } = await supabase.from("anchor_pack_items").upsert(
        {
          anchor_pack_id: packId,
          generation_id: body.generation_id,
          role: body.role,
          sort_order: body.sort_order ?? 0,
          camera_signature: body.camera_signature?.trim() || null,
          lighting_signature: body.lighting_signature?.trim() || null,
          pose_signature: body.pose_signature?.trim() || null,
          garment_signature: body.garment_signature?.trim() || null,
          scene_signature: body.scene_signature?.trim() || null,
          notes: body.notes?.trim() || null,
          stability_score: computedItemScore,
        },
        { onConflict: "anchor_pack_id,generation_id,role" },
      );

      if (error) return json(400, { success: false, error: error.message });
    }

    await recomputePack(supabase, packId);

    const { data, error: refreshedError } = await supabase
      .from("anchor_packs")
      .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
      .eq("id", packId)
      .single();

    if (refreshedError) return json(400, { success: false, error: refreshedError.message });

    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
