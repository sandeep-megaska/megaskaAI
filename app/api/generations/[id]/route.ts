import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type GenerationRecord = {
  id: string;
  asset_url: string | null;
  url: string | null;
  thumbnail_url: string | null;
};

type StorageObjectRef = {
  bucket: string;
  path: string;
};

function parseStorageObjectRef(rawUrl: string | null | undefined): StorageObjectRef | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const marker = "/storage/v1/object/public/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const storagePath = parsed.pathname.slice(markerIndex + marker.length);
    const [bucket, ...pathParts] = storagePath.split("/").filter(Boolean);
    const path = pathParts.join("/");
    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Generation id is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("generations")
      .select("id,asset_url,url,thumbnail_url")
      .eq("id", id)
      .maybeSingle<GenerationRecord>();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ success: false, error: "Generation not found." }, { status: 404 });
    }

    const refs = [data.asset_url, data.url, data.thumbnail_url]
      .map((value) => parseStorageObjectRef(value))
      .filter((value): value is StorageObjectRef => Boolean(value));

    const refsByBucket = new Map<string, Set<string>>();
    for (const ref of refs) {
      const existing = refsByBucket.get(ref.bucket) ?? new Set<string>();
      existing.add(ref.path);
      refsByBucket.set(ref.bucket, existing);
    }

    for (const [bucket, paths] of refsByBucket.entries()) {
      if (!paths.size) continue;
      const { error: removeError } = await supabase.storage.from(bucket).remove([...paths]);
      if (removeError) {
        return NextResponse.json({ success: false, error: removeError.message }, { status: 500 });
      }
    }

    const { error: deleteError } = await supabase.from("generations").delete().eq("id", id);
    if (deleteError) {
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete generation.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
