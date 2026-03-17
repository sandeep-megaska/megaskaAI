import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

const allowedFields = [
  "garment_code",
  "sku",
  "display_name",
  "category",
  "sub_category",
  "status",
  "brand",
  "description",
  "notes",
  "colorway",
  "print_type",
  "fabric_notes",
  "silhouette_notes",
  "coverage_notes",
  "primary_front_asset_id",
  "primary_back_asset_id",
  "primary_detail_asset_id",
];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field] ?? null;
    }

    const { data, error } = await supabase
      .from("garment_library")
      .update(updates)
      .eq("id", id)
      .select("*, garment_assets(*)")
      .single();

    if (error) {
      console.error("[garments/:id][PATCH] update error", error);
      return json(400, { success: false, error: error.message });
    }

    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
