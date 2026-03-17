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

    if (!allFiles.length) {
      return json(400, { success: false, error: "Missing file field. Use 'files' or 'file'." });
    }

    const { data: existingAssets } = await supabase
      .from("model_assets")
      .select("id,is_primary,sort_order")
      .eq("model_id", id);

    const hasPrimary = Boolean(existingAssets?.some((asset) => asset.is_primary));
    const nextSortOrder = (existingAssets ?? []).reduce((max, asset) => Math.max(max, asset.sort_order ?? -1), -1) + 1;

    const createdAssets = [];

    for (let index = 0; index < allFiles.length; index += 1) {
      const file = allFiles[index];
      const bytes = Buffer.from(await file.arrayBuffer());
      const filePath = `models/${id}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage.from("brand-assets").upload(filePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) {
        console.error("[models/:id/assets][POST] upload error", uploadError);
        return json(500, { success: false, error: uploadError.message });
      }

      const { data: publicUrlData } = supabase.storage.from("brand-assets").getPublicUrl(filePath);
      const isPrimary = !hasPrimary && index === 0;

      const { data, error: insertError } = await supabase
        .from("model_assets")
        .insert({
          model_id: id,
          asset_url: publicUrlData.publicUrl,
          storage_path: filePath,
          is_primary: isPrimary,
          sort_order: nextSortOrder + index,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error("[models/:id/assets][POST] insert error", insertError);
        return json(500, { success: false, error: insertError.message });
      }

      createdAssets.push(data);
    }

    const { data: refreshedAssets, error: refreshedError } = await supabase
      .from("model_assets")
      .select("id,asset_url,storage_path,is_primary,sort_order")
      .eq("model_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });

    if (refreshedError) {
      return json(500, { success: false, error: refreshedError.message });
    }

    return json(201, {
      success: true,
      data: createdAssets,
      assets: refreshedAssets ?? [],
      asset_count: (refreshedAssets ?? []).length,
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
