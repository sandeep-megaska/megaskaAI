import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function sanitizeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return json(400, { success: false, error: "Missing file field." });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const filePath = `image/simple-frames/${Date.now()}-${randomUUID()}-${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) return json(500, { success: false, error: uploadError.message });

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const publicUrl = publicData.publicUrl;

    const { data: generation, error: generationError } = await supabase
      .from("generations")
      .insert({
        prompt: `Simple frame upload ${file.name}`,
        type: "Image",
        media_type: "Image",
        status: "completed",
        generation_kind: "image",
        asset_url: publicUrl,
        url: publicUrl,
        overlay_json: {
          generation_origin: "simple_video_frame_upload",
          source_file_name: file.name,
          storage_path: filePath,
        },
      })
      .select("id,asset_url,url")
      .single<{ id: string; asset_url: string | null; url: string | null }>();

    if (generationError || !generation) {
      return json(500, { success: false, error: generationError?.message ?? "Failed to create generation record." });
    }

    return json(201, {
      success: true,
      data: {
        generationId: generation.id,
        imageUrl: generation.asset_url ?? generation.url ?? publicUrl,
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
