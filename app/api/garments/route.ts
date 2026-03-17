import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { recomputeAndPersistGarmentReadiness } from "@/lib/tryon/computeGarmentReadiness";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

const editableFields = [
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
];

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");

    let query = supabase
      .from("garment_library")
      .select("*, garment_assets!garment_assets_garment_id_fkey(*)")
      .order("created_at", { ascending: false });

    if (status && status !== "all") query = query.eq("status", status);
    if (category && category !== "all") query = query.eq("category", category);

    const { data, error } = await query;

    if (error) {
      console.error("[garments][GET] query error", error);
      return json(500, { success: false, error: error.message });
    }

    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    if (!body.garment_code || !body.display_name) {
      return json(400, { success: false, error: "garment_code and display_name are required." });
    }

    const payload: Record<string, unknown> = {};
    for (const field of editableFields) {
      if (field in body) payload[field] = body[field] ?? null;
    }

    payload.status = body.status ?? "draft";
    payload.brand = body.brand ?? "Megaska";

    const { data, error } = await supabase
      .from("garment_library")
      .insert(payload)
      .select("*, garment_assets!garment_assets_garment_id_fkey(*)")
      .single();

    if (error) {
      console.error("[garments][POST] insert error", error);
      return json(400, { success: false, error: error.message });
    }

    await recomputeAndPersistGarmentReadiness({
      garmentId: data.id,
      garmentStatus: data.status,
      primaryFrontAssetId: data.primary_front_asset_id,
      primaryBackAssetId: data.primary_back_asset_id,
    });

    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
