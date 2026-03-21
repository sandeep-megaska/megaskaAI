import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: item, error: itemError } = await supabase
      .from("video_sequence_items")
      .select("id")
      .eq("id", itemId)
      .eq("sequence_id", id)
      .eq("is_active", true)
      .single();

    if (itemError || !item) return json(404, { success: false, error: itemError?.message ?? "Sequence item not found." });

    const { error } = await supabase
      .from("video_sequence_items")
      .update({ is_active: false })
      .eq("id", itemId)
      .eq("sequence_id", id);

    if (error) return json(400, { success: false, error: error.message });

    await compactSequenceOrder(id);

    return json(200, { success: true });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
