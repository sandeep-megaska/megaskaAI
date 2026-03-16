import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

const genAiApiKey = process.env.GOOGLE_API_KEY;
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
    if (!ai) {
      return Response.json(
        { success: false, error: "Missing GEMINI_API_KEY" },
        { status: 500 }
      );
    }

    if (!supabase) {
      return Response.json(
        {
          success: false,
          error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
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

    if (!type || !prompt || !["image", "video"].includes(type)) {
      return Response.json(
        {
          success: false,
          error: "Body must include valid 'type' and 'prompt'",
        },
        { status: 400 }
      );
    }

    console.log("[generate] request received", { type, aspect_ratio });

    let fileBuffer: Buffer;
    let contentType: string;
    let extension: string;

    if (type === "image") {
      // Nano Banana Pro / Gemini-native image generation
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: prompt,
      });

      const parts = response?.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((part: any) => part.inlineData?.data);

      if (!imagePart?.inlineData?.data) {
        console.error("[generate] image response parts:", JSON.stringify(parts, null, 2));
        return Response.json(
          { success: false, error: "No image data returned from Gemini image model." },
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
    } else {
      // Veo video generation
      let operation = await ai.models.generateVideos({
        model: "veo-3.1-generate-preview",
        prompt,
        config:
          aspect_ratio === "9:16"
            ? { aspectRatio: "9:16" }
            : aspect_ratio === "16:9"
            ? { aspectRatio: "16:9" }
            : undefined,
      });

      console.log("[generate] veo started");

      while (!operation.done) {
        await sleep(10000);
        operation = await ai.operations.getVideosOperation({
          operation,
        });
        console.log("[generate] veo polling", { done: operation.done });
      }

      const videoFile = operation?.response?.generatedVideos?.[0]?.video;

      if (!videoFile) {
        console.error("[generate] final veo operation:", JSON.stringify(operation, null, 2));
        return Response.json(
          { success: false, error: "No video returned from Veo." },
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
    }

    const filePath = `${type}/${randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[generate] supabase upload error", uploadError);
      return Response.json(
        { success: false, error: `Supabase upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage
      .from("brand-assets")
      .getPublicUrl(filePath);

    const { error: insertError } = await supabase.from("generations").insert({
      prompt,
      media_type: type === "image" ? "Image" : "Video",
      aspect_ratio,
      asset_url: publicData.publicUrl,
    });

    if (insertError) {
      console.error("[generate] DB insert error", insertError);
      return Response.json(
        { success: false, error: `DB insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      asset_url: publicData.publicUrl,
    });
  } catch (error) {
    console.error("[generate] unhandled error", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}