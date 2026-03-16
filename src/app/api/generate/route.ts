import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const genAiApiKey = process.env.GEMINI_API_KEY;
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
      { success: false, error: 'Missing GEMINI_API_KEY or Supabase environment variables.' },
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
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
        },
      });

      const generatedImage = imageResult.generatedImages?.[0]?.image;
      const imageBytes = generatedImage?.imageBytes;

      if (!imageBytes) {
        throw new Error('Image generation did not return image bytes.');
      }

      fileBuffer = Buffer.from(imageBytes, 'base64');
      contentType = generatedImage?.mimeType ?? 'image/png';
      extension = 'png';
    } else {
      let operation = await aiClient.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt,
        config: {
          numberOfVideos: 1,
        },
      });

     while (!operation.done) {
  await sleep(5000);
  // Pass the operation.name string directly to the get() method
  operation = (await aiClient.operations.get(operation.name)) as typeof operation;
}

      const generatedVideo = operation.response?.generatedVideos?.[0]?.video;

      if (!generatedVideo) {
        throw new Error('Video generation finished without a video result.');
      }

      if (generatedVideo.videoBytes) {
        fileBuffer = Buffer.from(generatedVideo.videoBytes, 'base64');
        contentType = generatedVideo.mimeType ?? 'video/mp4';
      } else if (generatedVideo.uri) {
        const downloadResponse = await fetch(generatedVideo.uri);

        if (!downloadResponse.ok) {
          throw new Error(`Failed to download generated video from URI: ${downloadResponse.status}`);
        }

        const arrayBuffer = await downloadResponse.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        contentType = generatedVideo.mimeType ?? downloadResponse.headers.get('content-type') ?? 'video/mp4';
      } else {
        throw new Error('Video generation did not return video bytes or URI.');
      }

      extension = contentType.includes('webm') ? 'webm' : 'mp4';
    }

    const filePath = `${type}/${randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('brand-assets')
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicData } = supabase.storage.from('brand-assets').getPublicUrl(filePath);
    const asset_url = publicData.publicUrl;

    const { error: insertError } = await supabase.from('generations').insert({
      prompt,
      media_type: type === 'image' ? 'Image' : 'Video',
      aspect_ratio: aspect_ratio ?? '1:1',
      asset_url,
    });

    if (insertError) {
      throw insertError;
    }

    return Response.json({ success: true, asset_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
