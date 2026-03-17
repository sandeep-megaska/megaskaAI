import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from("brand_presets").select("*").eq("id", id).maybeSingle();
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("brand_presets")
      .update({
        name: body.name,
        prompt_template: body.prompt_template,
        aspect_ratio: body.aspect_ratio,
        overlay_defaults: body.overlay_defaults,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return json(400, { success: false, error: error.message });
    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("brand_presets").delete().eq("id", id);
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
