import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ExtractFramePayload = {
  source_video_generation_id?: string;
  frame_url?: string;
  backend_model?: string | null;
  extraction_method?: "thumbnail" | "video-default" | "fallback";
};

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    let payload: ExtractFramePayload;

    try {
      payload = (await request.json()) as ExtractFramePayload;
    } catch {
      return asJson(400, { success: false, error: "Invalid JSON body." });
    }

    if (!payload.source_video_generation_id?.trim()) {
      return asJson(400, { success: false, error: "source_video_generation_id is required." });
    }

    const frameUrl = payload.frame_url?.trim();
    if (!frameUrl) {
      return asJson(400, { success: false, error: "frame_url is required." });
    }

    const supabase = getSupabaseAdminClient();

    const { data: sourceVideo, error: sourceError } = await supabase
      .from("generations")
      .select("id,prompt,aspect_ratio,overlay_json")
      .eq("id", payload.source_video_generation_id)
      .eq("generation_kind", "video")
      .maybeSingle();

    if (sourceError) {
      return asJson(500, { success: false, error: `Could not load source video: ${sourceError.message}` });
    }

    if (!sourceVideo) {
      return asJson(404, { success: false, error: "Source video generation not found." });
    }

    const extractedAt = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("generations")
      .insert({
        prompt: `Extracted frame from video: ${sourceVideo.prompt}`,
        type: "Image",
        media_type: "Image",
        aspect_ratio: sourceVideo.aspect_ratio ?? "1:1",
        asset_url: frameUrl,
        url: frameUrl,
        generation_kind: "image",
        source_generation_id: sourceVideo.id,
        reference_urls: [frameUrl],
        overlay_json: {
          studioWorkflowMode: "master-candidates",
          sourceVideoGenerationId: sourceVideo.id,
          extractedFromVideo: true,
          extractedAt,
          extractionMethod: payload.extraction_method ?? "thumbnail",
          backendModel:
            payload.backend_model ??
            (typeof sourceVideo.overlay_json?.backendModel === "string" ? sourceVideo.overlay_json.backendModel : null),
          referenceKindsUsed: ["video-frame"],
        },
      })
      .select("id")
      .single();

    if (insertError) {
      return asJson(500, { success: false, error: `Frame persistence failed: ${insertError.message}` });
    }

    return asJson(200, {
      success: true,
      generationId: inserted.id,
      frameUrl,
      sourceVideoGenerationId: sourceVideo.id,
      extractedAt,
    });
  } catch (error) {
    return asJson(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}
