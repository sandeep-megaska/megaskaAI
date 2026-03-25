import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("clip_source_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profile_name?: string;
      primary_generation_id?: string;
      additional_generation_ids?: string[];
      subject_notes?: string;
      garment_notes?: string;
      scene_notes?: string;
    };

    if (!body.profile_name?.trim()) return json(400, { success: false, error: "profile_name is required." });
    if (!body.primary_generation_id?.trim()) return json(400, { success: false, error: "primary_generation_id is required." });

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("clip_source_profiles")
      .insert({
        profile_name: body.profile_name.trim(),
        primary_generation_id: body.primary_generation_id.trim(),
        additional_generation_ids: Array.isArray(body.additional_generation_ids) ? body.additional_generation_ids : [],
        subject_notes: body.subject_notes?.trim() || null,
        garment_notes: body.garment_notes?.trim() || null,
        scene_notes: body.scene_notes?.trim() || null,
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
