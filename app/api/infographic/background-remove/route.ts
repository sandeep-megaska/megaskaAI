import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { withProviderResilience } from "@/lib/ai/providerResilience";

export const runtime = "nodejs";
export const maxDuration = 180;

type SubjectMode="product-only"|"keep-model";
type Payload={image_url?:string;name?:string;subject_mode?:SubjectMode};

const PRODUCT_ISOLATION_PROMPT="Isolate only the primary sellable product/garment exactly as photographed. Remove the entire environment AND remove the person/model/mannequin wearing or holding it. Return only the product, centered on a plain simple background suitable for a subsequent segmentation pass. Preserve exact product colors, silhouette, construction, texture, stitching, hardware, printed graphics and logos. Do not redesign, retouch, add, crop, or invent product details. Do not draw a checkerboard or transparency pattern.";

function asJson(status:number,body:Record<string,unknown>){return NextResponse.json(body,{status});}

function inspectPngAlpha(bytes:Buffer){
  const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
  if(bytes.length<33||!bytes.subarray(0,8).equals(pngSignature))return {isPng:false,hasAlphaChannel:false,transparency:"unknown" as const};
  const colorType=bytes[25];
  const hasAlphaChannel=colorType===4||colorType===6;
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

async function removeBackgroundDeterministically(input:Buffer,mimeType:string){
  const apiKey=process.env.REMOVE_BG_API_KEY;
  if(!apiKey)throw new Error("Deterministic background removal is not configured. Add REMOVE_BG_API_KEY to the server environment.");
  const form=new FormData();
  form.append("image_file",new Blob([new Uint8Array(input)],{type:mimeType}),"source");
  form.append("size","full");
  form.append("format","png");
  form.append("channels","rgba");
  const response=await fetch("https://api.remove.bg/v1.0/removebg",{
    method:"POST",
    headers:{"X-Api-Key":apiKey},
    body:form,
  });
  if(!response.ok){
    const detail=(await response.text()).slice(0,500);
    throw new Error(`Deterministic background removal failed (${response.status})${detail?`: ${detail}`:"."}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function isolateProductWithGemini(bytes:Buffer,mimeType:string,apiKey:string){
  const ai=new GoogleGenAI({apiKey});
  const response=await withProviderResilience(
    {provider:"gemini",model:"gemini-2.5-flash-image",operation:"product-isolation"},
    ()=>ai.models.generateContent({
      model:"gemini-2.5-flash-image",
      contents:[{role:"user",parts:[
        {text:PRODUCT_ISOLATION_PROMPT},
        {inlineData:{mimeType,data:bytes.toString("base64")}}
      ]}],
      config:{responseModalities:["IMAGE","TEXT"]},
    }),
  );
  const imagePart=(response.candidates?.[0]?.content?.parts??[]).find(part=>part.inlineData?.data);
  if(!imagePart?.inlineData?.data)throw new Error("Product isolation did not return an image.");
  return {
    bytes:Buffer.from(imagePart.inlineData.data,"base64"),
    mimeType:imagePart.inlineData.mimeType||"image/png",
  };
}

export async function POST(request:Request){
  try{
    const payload=(await request.json()) as Payload;
    const imageUrl=payload.image_url?.trim();
    const subjectMode:SubjectMode=payload.subject_mode==="keep-model"?"keep-model":"product-only";
    if(!imageUrl||!/^https?:\/\//i.test(imageUrl))return asJson(400,{success:false,error:"A public image URL is required."});

    const source=await fetch(imageUrl);
    if(!source.ok)return asJson(400,{success:false,error:"Could not fetch the selected image."});
    const sourceMime=source.headers.get("content-type")||"image/png";
    const sourceBytes=Buffer.from(await source.arrayBuffer());

    let segmentationInput=sourceBytes;
    let segmentationMime=sourceMime;
    let semanticIsolationUsed=false;

    // Keeping the model needs no generative edit: segment the original pixels directly.
    // Product-only still needs semantic removal of the wearer/mannequin first; the final
    // transparency is always produced by the deterministic segmentation provider.
    if(subjectMode==="product-only"){
      const googleKey=process.env.GOOGLE_API_KEY??process.env.GEMINI_API_KEY;
      if(!googleKey)return asJson(503,{success:false,error:"Google image service is not configured for product-only isolation."});
      const isolated=await isolateProductWithGemini(sourceBytes,sourceMime,googleKey);
      segmentationInput=isolated.bytes;
      segmentationMime=isolated.mimeType;
      semanticIsolationUsed=true;
    }

    const output=await removeBackgroundDeterministically(segmentationInput,segmentationMime);
    const alpha=inspectPngAlpha(output);
    const transparencyValidated=alpha.isPng&&alpha.transparency==="present";
    if(!transparencyValidated){
      return asJson(502,{success:false,error:"Background removal returned an invalid asset without a PNG alpha/transparency channel.",alphaInspection:alpha});
    }

    const supabase=getSupabaseAdminClient();
    const bucket=process.env.SUPABASE_STORAGE_BUCKET??"brand-assets";
    const path=`infographic/background-removed/${subjectMode}/${Date.now()}-${(payload.name||"product").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40)||"product"}.png`;
    const {error}=await supabase.storage.from(bucket).upload(path,output,{contentType:"image/png",upsert:false});
    if(error)return asJson(500,{success:false,error:`Upload failed: ${error.message}`});
    const {data}=supabase.storage.from(bucket).getPublicUrl(path);
    return asJson(200,{
      success:true,
      outputUrl:data.publicUrl,
      path,
      subjectMode,
      transparencyValidated:true,
      alphaInspection:alpha,
      alphaEngine:"remove.bg",
      semanticIsolationUsed,
      warning:null,
    });
  }catch(error){
    console.error("[infographic/background-remove]",error);
    const message=error instanceof Error?error.message:"Background removal failed.";
    const status=message.includes("not configured")?503:500;
    return asJson(status,{success:false,error:message});
  }
}
