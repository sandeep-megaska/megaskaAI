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
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return json(400, { success: false, error: "Missing file field." });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const filePath = `models/${id}/${Date.now()}-${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from("brand-assets").upload(filePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      return json(500, { success: false, error: uploadError.message });
    }

    const { data: publicUrlData } = supabase.storage.from("brand-assets").getPublicUrl(filePath);

    const { data, error: insertError } = await supabase
      .from("model_assets")
      .insert({
        model_id: id,
        asset_url: publicUrlData.publicUrl,
        storage_path: filePath,
      })
      .select("*")
      .single();

    if (insertError) {
      return json(500, { success: false, error: insertError.message });
    }

    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
