import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

const genAiApiKey =
  process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ai = genAiApiKey ? new GoogleGenAI({ apiKey: genAiApiKey }) : null;
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

type GenerateRequest = {
  type: "image" | "video";
  prompt: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    console.log("[generate] route hit");

    if (!genAiApiKey) {
      console.error("[generate] missing Google key");
      return Response.json(
        {
          success: false,
          error: "Missing GOOGLE_API_KEY / GEMINI_API_KEY",
        },
        { status: 500 }
      );
    }

    if (!supabaseUrl) {
      console.error("[generate] missing supabase url");
      return Response.json(
        {
          success: false,
          error: "Missing NEXT_PUBLIC_SUPABASE_URL",
        },
        { status: 500 }
      );
    }

    if (!supabaseServiceRoleKey) {
      console.error("[generate] missing service role key");
      return Response.json(
        {
          success: false,
          error: "Missing SUPABASE_SERVICE_ROLE_KEY",
        },
        { status: 500 }
      );
    }

    if (!ai || !supabase) {
      console.error("[generate] ai or supabase client not created");
      return Response.json(
        {
          success: false,
          error: "Failed to initialize AI or Supabase client",
        },
        { status: 500 }
      );
    }

    let body: GenerateRequest;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { type, prompt, aspect_ratio = "1:1" } = body;

    console.log("[generate] request body", { type, prompt, aspect_ratio });

    if (!type || !prompt || !["image", "video"].includes(type)) {
      return Response.json(
        { success: false, error: "Invalid type or prompt" },
        { status: 400 }
      );
    }

    let fileBuffer: Buffer;
    let contentType: string;
    let extension: string;

    if (type === "image") {
      console.log("[generate] calling image model");

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: prompt,
      });

      const parts = response?.candidates?.[0]?.content?.parts ?? [];
      console.log("[generate] image parts count", parts.length);

      const imagePart = parts.find((part: any) => part.inlineData?.data);

      if (!imagePart?.inlineData?.data) {
        console.error("[generate] no image data", JSON.stringify(parts, null, 2));
        return Response.json(
          {
            success: false,
            error: "Model returned no image bytes",
            debug_parts: parts,
          },
          { status: 500 }
        );
      }

      fileBuffer = Buffer.from(imagePart.inlineData.data, "base64");
      contentType = imagePart.inlineData.mimeType || "image/png";
      extension = contentType.includes("jpeg")
        ? "jpg"
        : contentType.includes("webp")
        ? "webp"
        : "png";

      console.log("[generate] image generated", {
        contentType,
        size: fileBuffer.length,
      });
    } else {
      console.log("[generate] starting video generation");

      let operation = await ai.models.generateVideos({
        model: "veo-3.1-generate-preview",
        prompt,
        config:
          aspect_ratio === "16:9"
            ? { aspectRatio: "16:9" }
            : aspect_ratio === "9:16"
            ? { aspectRatio: "9:16" }
            : undefined,
      });

      while (!operation.done) {
        await sleep(10000);
        operation = await ai.operations.getVideosOperation({ operation });
        console.log("[generate] polling video", { done: operation.done });
      }

      const videoFile = operation?.response?.generatedVideos?.[0]?.video;

      if (!videoFile) {
        console.error("[generate] no video file", JSON.stringify(operation, null, 2));
        return Response.json(
          { success: false, error: "No video returned from Veo" },
          { status: 500 }
        );
      }

      await ai.files.download({
        file: videoFile,
        downloadPath: "/tmp/generated-video.mp4",
      });

      const fs = await import("node:fs/promises");
      fileBuffer = Buffer.from(await fs.readFile("/tmp/generated-video.mp4"));
      contentType = "video/mp4";
      extension = "mp4";

      console.log("[generate] video downloaded", {
        contentType,
        size: fileBuffer.length,
      });
    }

    const filePath = `${type}/${randomUUID()}.${extension}`;
    console.log("[generate] uploading to supabase", { filePath });

    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[generate] upload failed", uploadError);
      return Response.json(
        {
          success: false,
          error: `Supabase upload failed: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage
      .from("brand-assets")
      .getPublicUrl(filePath);

    console.log("[generate] public url", publicData.publicUrl);

    const { error: insertError } = await supabase.from("generations").insert({
      prompt,
      media_type: type === "image" ? "Image" : "Video",
      aspect_ratio,
      asset_url: publicData.publicUrl,
    });

    if (insertError) {
      console.error("[generate] db insert failed", insertError);
      return Response.json(
        {
          success: false,
          error: `DB insert failed: ${insertError.message}`,
          asset_url: publicData.publicUrl,
        },
        { status: 500 }
      );
    }

    console.log("[generate] success");

    return Response.json({
      success: true,
      asset_url: publicData.publicUrl,
    });
  } catch (error) {
    console.error("[generate] unhandled", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}