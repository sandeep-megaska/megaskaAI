import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

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
    const filePath = `references/${Date.now()}-${sanitizeFileName(file.name)}`;

    const { error } = await supabase.storage.from(bucket).upload(filePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (error) {
      return json(500, { success: false, error: error.message });
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return json(200, { success: true, public_url: data.publicUrl, storage_path: filePath });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
