import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function parseRunMeta(runMeta: unknown): Record<string, unknown> {
  if (!runMeta || typeof runMeta !== "object" || Array.isArray(runMeta)) return {};
  return runMeta as Record<string, unknown>;
}

async function compactSequenceOrder(sequenceId: string) {
  const supabase = getSupabaseAdminClient();
  const { data: items } = await supabase
    .from("video_sequence_items")
    .select("id")
    .eq("sequence_id", sequenceId)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  for (const [index, item] of (items ?? []).entries()) {
    await supabase.from("video_sequence_items").update({ order_index: index }).eq("id", item.id);
  }

  await supabase.from("video_sequences").update({ updated_at: new Date().toISOString() }).eq("id", sequenceId);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { run_id?: string };
    if (!body.run_id?.trim()) return json(400, { success: false, error: "run_id is required." });

    const supabase = getSupabaseAdminClient();

    const [{ data: sequence, error: sequenceError }, { data: run, error: runError }] = await Promise.all([
      supabase.from("video_sequences").select("id").eq("id", id).single(),
      supabase.from("video_generation_runs").select("id,run_meta").eq("id", body.run_id).single(),
    ]);

    if (sequenceError || !sequence) return json(404, { success: false, error: sequenceError?.message ?? "Sequence not found." });
    if (runError || !run) return json(404, { success: false, error: runError?.message ?? "Run not found." });

    const runMeta = parseRunMeta(run.run_meta);
    if (!runMeta.accepted_for_sequence) {
      return json(400, { success: false, error: "Only accepted clips can be added to a sequence." });
    }

    const { data: existingActive } = await supabase
      .from("video_sequence_items")
      .select("id")
      .eq("sequence_id", id)
      .eq("run_id", body.run_id)
      .eq("is_active", true)
      .maybeSingle();
    if (existingActive) return json(400, { success: false, error: "Run is already active in this sequence." });

    const { data: lastItem } = await supabase
      .from("video_sequence_items")
      .select("order_index")
      .eq("sequence_id", id)
      .eq("is_active", true)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = typeof lastItem?.order_index === "number" ? lastItem.order_index + 1 : 0;

    const { data, error } = await supabase
      .from("video_sequence_items")
      .insert({
        sequence_id: id,
        run_id: body.run_id,
        order_index: nextOrder,
        is_active: true,
      })
      .select("id,sequence_id,run_id,order_index,is_active,created_at")
      .single();

    if (error) return json(400, { success: false, error: error.message });

    await supabase.from("video_sequences").update({ updated_at: new Date().toISOString() }).eq("id", id);

    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      action?: "reorder" | "move_up" | "move_down";
      ordered_item_ids?: string[];
      item_id?: string;
    };

    const supabase = getSupabaseAdminClient();

    if (body.action === "reorder") {
      if (!(body.ordered_item_ids ?? []).length) {
        return json(400, { success: false, error: "ordered_item_ids is required for reorder." });
      }

      for (const [index, itemId] of (body.ordered_item_ids ?? []).entries()) {
        await supabase
          .from("video_sequence_items")
          .update({ order_index: index })
          .eq("id", itemId)
          .eq("sequence_id", id)
          .eq("is_active", true);
      }
      await compactSequenceOrder(id);
      return json(200, { success: true });
    }

    if (!body.item_id?.trim()) return json(400, { success: false, error: "item_id is required." });

    const { data: items } = await supabase
      .from("video_sequence_items")
      .select("id,order_index")
      .eq("sequence_id", id)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    const ordered = items ?? [];
    const currentIndex = ordered.findIndex((item) => item.id === body.item_id);
    if (currentIndex === -1) return json(404, { success: false, error: "Sequence item not found." });

    const swapIndex = body.action === "move_up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= ordered.length) return json(200, { success: true, data: { no_op: true } });

    const a = ordered[currentIndex];
    const b = ordered[swapIndex];
    await supabase.from("video_sequence_items").update({ order_index: b.order_index }).eq("id", a.id);
    await supabase.from("video_sequence_items").update({ order_index: a.order_index }).eq("id", b.id);

    await compactSequenceOrder(id);

    return json(200, { success: true });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
