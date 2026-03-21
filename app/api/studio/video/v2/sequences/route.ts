import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { VIDEO_SEQUENCE_STATUSES, type VideoSequenceStatus } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: sequences, error } = await supabase
      .from("video_sequences")
      .select("id,project_id,sequence_name,status,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) return json(500, { success: false, error: error.message });

    const sequenceIds = (sequences ?? []).map((sequence) => sequence.id);
    const { data: items } = sequenceIds.length
      ? await supabase.from("video_sequence_items").select("sequence_id,is_active").in("sequence_id", sequenceIds)
      : { data: [] as Array<{ sequence_id: string; is_active: boolean }> };

    const countBySequence = (items ?? []).reduce<Record<string, number>>((acc, item) => {
      if (!item.is_active) return acc;
      acc[item.sequence_id] = (acc[item.sequence_id] ?? 0) + 1;
      return acc;
    }, {});

    return json(200, {
      success: true,
      data: (sequences ?? []).map((sequence) => ({
        ...sequence,
        clip_count: countBySequence[sequence.id] ?? 0,
      })),
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      project_id?: string;
      sequence_name?: string;
      status?: VideoSequenceStatus;
    };

    if (!body.sequence_name?.trim()) return json(400, { success: false, error: "sequence_name is required." });
    if (body.status && !VIDEO_SEQUENCE_STATUSES.includes(body.status)) {
      return json(400, { success: false, error: "status is invalid." });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("video_sequences")
      .insert({
        project_id: body.project_id?.trim() || "studio-video-v2",
        sequence_name: body.sequence_name.trim(),
        status: body.status ?? "draft",
      })
      .select("id,project_id,sequence_name,status,created_at,updated_at")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data: { ...data, clip_count: 0 } });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
