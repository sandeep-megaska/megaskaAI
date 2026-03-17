import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function sanitizeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const formData = await request.formData();
    const allFiles = formData
      .getAll("files")
      .concat(formData.get("file") ? [formData.get("file") as FormDataEntryValue] : [])
      .filter((entry): entry is File => entry instanceof File);

    const assetType = String(formData.get("asset_type") ?? "reference");
    const viewLabel = formData.get("view_label") ? String(formData.get("view_label")) : null;
    const detailZone = formData.get("detail_zone") ? String(formData.get("detail_zone")) : null;

    if (!allFiles.length) {
      return json(400, { success: false, error: "Missing file field. Use 'files' or 'file'." });
    }

    const { data: existingAssets } = await supabase
      .from("garment_assets")
      .select("sort_order")
      .eq("garment_id", id);

    const nextSortOrder = (existingAssets ?? []).reduce((max, asset) => Math.max(max, asset.sort_order ?? -1), -1) + 1;

    const createdAssets = [];

    for (let index = 0; index < allFiles.length; index += 1) {
      const file = allFiles[index];
      const bytes = Buffer.from(await file.arrayBuffer());
      const filePath = `garments/${id}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage.from("brand-assets").upload(filePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) {
        console.error("[garments/:id/assets][POST] upload error", uploadError);
        return json(500, { success: false, error: uploadError.message });
      }

      const { data: publicUrlData } = supabase.storage.from("brand-assets").getPublicUrl(filePath);

      const { data, error: insertError } = await supabase
        .from("garment_assets")
        .insert({
          garment_id: id,
          asset_type: assetType,
          file_path: filePath,
          public_url: publicUrlData.publicUrl,
          sort_order: nextSortOrder + index,
          view_label: viewLabel,
          detail_zone: detailZone,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error("[garments/:id/assets][POST] insert error", insertError);
        return json(500, { success: false, error: insertError.message });
      }

      createdAssets.push(data);
    }

    return json(201, { success: true, data: createdAssets });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const body = await request.json();

    if (!body.asset_id) {
      return json(400, { success: false, error: "asset_id is required." });
    }

    const updates: Record<string, unknown> = {};
    const allowedFields = ["asset_type", "view_label", "detail_zone", "sort_order", "is_primary", "meta"];
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field] ?? null;
    }

    const { data, error } = await supabase
      .from("garment_assets")
      .update(updates)
      .eq("id", body.asset_id)
      .eq("garment_id", id)
      .select("*")
      .single();

    if (error) {
      return json(400, { success: false, error: error.message });
    }

    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
