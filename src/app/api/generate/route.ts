import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const genAiApiKey = process.env.GOOGLE_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const aiClient = genAiApiKey ? new GoogleGenAI({ apiKey: genAiApiKey }) : null;
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

type GenerateRequest = {
  type: 'image' | 'video';
  prompt: string;
  aspect_ratio?: '1:1' | '16:9' | '9:16';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  if (!aiClient || !supabase) {
    return Response.json(
      { success: false, error: 'Missing API keys or environment variables.' },
      { status: 500 },
    );
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { type, prompt, aspect_ratio } = body;
  console.log("DEBUG: Starting generation for:", { type, prompt });

  if (!type || !prompt || !['image', 'video'].includes(type)) {
    return Response.json(
      { success: false, error: "Body must include 'type' ('image' or 'video') and 'prompt'." },
      { status: 400 },
    );
  }

  try {
    let fileBuffer: Buffer;
    let contentType: string;
    let extension: string;

    if (type === 'image') {
      const imageResult = await aiClient.models.generateImages({
        model: 'gemini-3-pro-image-preview',
        prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/png' },
      });
      console.log("DEBUG: Image generated, now uploading to Supabase...");

      const generatedImage = imageResult.generatedImages?.[0]?.image;
      if (!generatedImage?.imageBytes) throw new Error('Image generation failed.');

      fileBuffer = Buffer.from(generatedImage.imageBytes, 'base64');
      contentType = 'image/png';
      extension = 'png';
    } else {
      let operation = await aiClient.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt,
      });

      console.log("DEBUG: Video generation started, polling...");
      while (!operation.done) {
        await sleep(5000);
        if (!operation.name) throw new Error("Operation name is missing.");
        operation = (await aiClient.operations.get(operation.name as any)) as typeof operation;
        console.log("DEBUG: Polling Veo... done:", operation.done);
      }

      const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
      if (!generatedVideo?.uri) throw new Error('Video generation failed.');

      const downloadResponse = await fetch(generatedVideo.uri);
      const arrayBuffer = await downloadResponse.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      contentType = 'video/mp4';
      extension = 'mp4';
    }

    const filePath = `${type}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('brand-assets')
      .upload(filePath, fileBuffer, { contentType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from('brand-assets').getPublicUrl(filePath);
    
    const { error: insertError } = await supabase.from('generations').insert({
      prompt,
      media_type: type === 'image' ? 'Image' : 'Video',
      aspect_ratio: aspect_ratio ?? '1:1',
      asset_url: publicData.publicUrl,
    });

    if (insertError) throw insertError;

    return Response.json({ success: true, asset_url: publicData.publicUrl });
  } catch (error) {
    console.error("GENERATION_ERROR:", error);
    return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error.' }, { status: 500 });
  }
}