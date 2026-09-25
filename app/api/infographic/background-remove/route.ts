import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { withProviderResilience } from "@/lib/ai/providerResilience";

export const runtime = "nodejs";
export const maxDuration = 180;

type SubjectMode="product-only"|"keep-model";
type Payload={image_url?:string;name?:string;subject_mode?:SubjectMode};

const PROMPTS:Record<SubjectMode,string>={
  "product-only":"Isolate only the primary sellable product/garment exactly as photographed. Remove the entire background AND remove the person/model/mannequin wearing or holding it. Return only the product on a transparent background. Preserve exact product colors, silhouette, construction, texture, stitching, hardware, printed graphics and logos. Do not redesign, retouch, add, crop, or invent product details.",
  "keep-model":"Remove only the environment/background. KEEP the complete person/model and the complete product/garment exactly as photographed as one foreground subject. Do not remove, replace, reshape or regenerate the model, face, hair, hands, body, garment, accessories that belong to the subject, or any part of the product. Preserve exact pose, anatomy, skin appearance, product colors, construction, texture, printed graphics and logos. Return the model wearing/holding the product on a transparent background. Do not add scenery or text."
};

function asJson(status:number,body:Record<string,unknown>){return NextResponse.json(body,{status});}

function inspectPngAlpha(bytes:Buffer){
  const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
  if(bytes.length<33||!bytes.subarray(0,8).equals(pngSignature))return {isPng:false,hasAlphaChannel:false,transparency:"unknown" as const};
  const colorType=bytes[25];
  const hasAlphaChannel=colorType===4||colorType===6;
  // PNG color types 4/6 carry a real alpha channel. Type 3 may use a tRNS
  // transparency chunk, so scan chunks without decoding image pixels.
  let offset=8;
  let hasTransparencyChunk=false;
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset);
    const type=bytes.toString("ascii",offset+4,offset+8);
    if(type==="tRNS")hasTransparencyChunk=true;
    offset+=12+length;
    if(type==="IEND")break;
  }
  const transparentCapable=hasAlphaChannel||hasTransparencyChunk;
  return {isPng:true,hasAlphaChannel,hasTransparencyChunk,transparency:transparentCapable?"present" as const:"absent" as const};
}

export async function POST(request:Request){
  try{
    const payload=(await request.json()) as Payload;
    const imageUrl=payload.image_url?.trim();
    const subjectMode:SubjectMode=payload.subject_mode==="keep-model"?"keep-model":"product-only";
    if(!imageUrl||!/^https?:\/\//i.test(imageUrl))return asJson(400,{success:false,error:"A public image URL is required."});
    const apiKey=process.env.GOOGLE_API_KEY??process.env.GEMINI_API_KEY;
    if(!apiKey)return asJson(503,{success:false,error:"Google image service is not configured."});

    const source=await fetch(imageUrl);
    if(!source.ok)return asJson(400,{success:false,error:"Could not fetch the selected image."});
    const mimeType=source.headers.get("content-type")||"image/png";
    const bytes=Buffer.from(await source.arrayBuffer());
    const ai=new GoogleGenAI({apiKey});
    const response=await withProviderResilience(
      {provider:"gemini",model:"gemini-2.5-flash-image",operation:"background-removal"},
      ()=>ai.models.generateContent({
        model:"gemini-2.5-flash-image",
        contents:[{role:"user",parts:[
          {text:PROMPTS[subjectMode]},
          {inlineData:{mimeType,data:bytes.toString("base64")}}
        ]}],
        config:{responseModalities:["IMAGE","TEXT"]},
      }),
    );
    const parts=response.candidates?.[0]?.content?.parts??[];
    const imagePart=parts.find(part=>part.inlineData?.data);
    if(!imagePart?.inlineData?.data)return asJson(502,{success:false,error:"Background removal did not return an image."});
    const outputMime=imagePart.inlineData.mimeType||"image/png";
    const output=Buffer.from(imagePart.inlineData.data,"base64");
    const alpha=inspectPngAlpha(output);
    const transparencyValidated=alpha.transparency==="present";
    const supabase=getSupabaseAdminClient();
    const bucket=process.env.SUPABASE_STORAGE_BUCKET??"brand-assets";
    const ext=outputMime.includes("jpeg")?"jpg":"png";
    const path=`infographic/background-removed/${subjectMode}/${Date.now()}-${(payload.name||"product").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40)||"product"}.${ext}`;
    const {error}=await supabase.storage.from(bucket).upload(path,output,{contentType:outputMime,upsert:false});
    if(error)return asJson(500,{success:false,error:`Upload failed: ${error.message}`});
    const {data}=supabase.storage.from(bucket).getPublicUrl(path);
    return asJson(200,{success:true,outputUrl:data.publicUrl,path,subjectMode,transparencyValidated,alphaInspection:alpha,warning:transparencyValidated?null:"The returned image does not expose a PNG alpha/transparency channel. The visible checkerboard may be baked into the pixels rather than real transparency."});
  }catch(error){
    console.error("[infographic/background-remove]",error);
    return asJson(500,{success:false,error:error instanceof Error?error.message:"Background removal failed."});
  }
}
