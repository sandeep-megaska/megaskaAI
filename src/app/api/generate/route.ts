import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

type GenerateRequest = {
  type: 'image' | 'video';
  prompt: string;
  aspect_ratio?: '1:1' | '16:9' | '9:16';
};

type GenerationRecord = {
  id: string;
  prompt: string;
  media_type: string;
  asset_url: string;
  aspect_ratio: string | null;
};

type GeneratedVideo = {
  mimeType?: string;
  uri?: string;
  videoBytes?: string;
};

type VideoOperationResponse = {
  generatedVideos?: Array<{ video?: GeneratedVideo }>;
};

type VideoOperation = {
  name?: string;
  done?: boolean;
  response?: VideoOperationResponse;
};

const googleApiKey = process.env.GOOGLE_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const aiClient = googleApiKey ? new GoogleGenAI({ apiKey: googleApiKey }) : null;
const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getExtensionForMimeType = (mimeType: string) => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('webm')) return 'webm';
  return 'mp4';
};

export async function POST(request: Request) {
  if (!aiClient || !supabase) {
    return Response.json(
      {
        error:
          'Missing required environment variables. Set GOOGLE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 500 },
    );
  }

  let body: GenerateRequest;

  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { type, prompt, aspect_ratio = '1:1' } = body;

  if (!type || (type !== 'image' && type !== 'video')) {
    return Response.json({ error: "'type' must be either 'image' or 'video'." }, { status: 400 });
  }

  if (!prompt || typeof prompt !== 'string') {
    return Response.json({ error: "'prompt' is required and must be a string." }, { status: 400 });
  }

  if (aspect_ratio && !['1:1', '16:9', '9:16'].includes(aspect_ratio)) {
    return Response.json(
      { error: "'aspect_ratio' must be one of '1:1', '16:9', or '9:16'." },
      { status: 400 },
    );
  }

  try {
    let fileBuffer: Buffer;
    let mimeType: string;

    if (type === 'image') {
      const imageResult = await aiClient.models.generateImages({
        model: 'gemini-3-pro-image-preview',
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: aspect_ratio,
        },
      });

      const generatedImage = imageResult.generatedImages?.[0]?.image;
      const imageBytes = generatedImage?.imageBytes;

      if (!imageBytes) {
        throw new Error('Image generation did not return image bytes.');
      }

      fileBuffer = Buffer.from(imageBytes, 'base64');
      mimeType = generatedImage?.mimeType ?? 'image/png';
    } else {
      let operation = (await aiClient.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt,
      })) as VideoOperation;

      while (!operation.done) {
        await sleep(5000);

        if (!operation.name) {
          throw new Error('Video operation is missing an operation name.');
        }

        operation = (await aiClient.operations.get({ name: operation.name })) as VideoOperation;
      }

      const generatedVideo = operation.response?.generatedVideos?.[0]?.video;

      if (!generatedVideo) {
        throw new Error('Video generation finished without returning a video.');
      }

      if (generatedVideo.videoBytes) {
        fileBuffer = Buffer.from(generatedVideo.videoBytes, 'base64');
        mimeType = generatedVideo.mimeType ?? 'video/mp4';
      } else if (generatedVideo.uri) {
        const downloadResponse = await fetch(generatedVideo.uri);

        if (!downloadResponse.ok) {
          throw new Error(`Failed to download generated video: ${downloadResponse.status}`);
        }

        const arrayBuffer = await downloadResponse.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        mimeType = generatedVideo.mimeType ?? downloadResponse.headers.get('content-type') ?? 'video/mp4';
      } else {
        throw new Error('Video generation did not include bytes or a downloadable URI.');
      }
    }

    const extension = getExtensionForMimeType(mimeType);
    const filename = `${randomUUID()}.${extension}`;
    const filePath = `${type}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('brand-assets')
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from('brand-assets').getPublicUrl(filePath);
    const asset_url = publicUrlData.publicUrl;

    const { data: insertedRecord, error: insertError } = await supabase
      .from('generations')
      .insert({
        prompt,
        media_type: type,
        asset_url,
        aspect_ratio,
      })
      .select('id, prompt, media_type, asset_url, aspect_ratio')
      .single<GenerationRecord>();

    if (insertError) {
      throw new Error(`Failed to save generation record: ${insertError.message}`);
    }

    return Response.json(insertedRecord, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred.';
    return Response.json({ error: message }, { status: 500 });
  }
}
