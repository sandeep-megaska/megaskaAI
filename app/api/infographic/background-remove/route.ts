import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 180;

type Payload={image_url?:string;name?:string};

function asJson(status:number,body:Record<string,unknown>){return NextResponse.json(body,{status});}

export async function POST(request:Request){
  try{
    const payload=(await request.json()) as Payload;
    const imageUrl=payload.image_url?.trim();
    if(!imageUrl||!/^https?:\/\//i.test(imageUrl))return asJson(400,{success:false,error:"A public image URL is required."});
    const apiKey=process.env.GOOGLE_API_KEY??process.env.GEMINI_API_KEY;
    if(!apiKey)return asJson(503,{success:false,error:"Google image service is not configured."});

    const source=await fetch(imageUrl);
    if(!source.ok)return asJson(400,{success:false,error:"Could not fetch the selected image."});
    const mimeType=source.headers.get("content-type")||"image/png";
    const bytes=Buffer.from(await source.arrayBuffer());
    const ai=new GoogleGenAI({apiKey});
    const response=await ai.models.generateContent({
      model:"gemini-2.5-flash-image",
      contents:[{role:"user",parts:[
        {text:"Isolate the primary product exactly as photographed. Remove the entire background and return the product on a transparent background. Preserve exact colors, shape, construction, texture, printed graphics and logos. Do not redesign, retouch, add, remove, crop, or invent product details. Output only the isolated product image."},
        {inlineData:{mimeType,data:bytes.toString("base64")}}
      ]}],
      config:{responseModalities:["IMAGE","TEXT"]},
    });
    const parts=response.candidates?.[0]?.content?.parts??[];
    const imagePart=parts.find(part=>part.inlineData?.data);
    if(!imagePart?.inlineData?.data)return asJson(502,{success:false,error:"Background removal did not return an image."});
    const outputMime=imagePart.inlineData.mimeType||"image/png";
    const output=Buffer.from(imagePart.inlineData.data,"base64");
    const supabase=getSupabaseAdminClient();
    const bucket=process.env.SUPABASE_STORAGE_BUCKET??"brand-assets";
    const ext=outputMime.includes("jpeg")?"jpg":"png";
    const path=`infographic/background-removed/${Date.now()}-${(payload.name||"product").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40)||"product"}.${ext}`;
    const {error}=await supabase.storage.from(bucket).upload(path,output,{contentType:outputMime,upsert:false});
    if(error)return asJson(500,{success:false,error:`Upload failed: ${error.message}`});
    const {data}=supabase.storage.from(bucket).getPublicUrl(path);
    return asJson(200,{success:true,outputUrl:data.publicUrl,path});
  }catch(error){
    console.error("[infographic/background-remove]",error);
    return asJson(500,{success:false,error:error instanceof Error?error.message:"Background removal failed."});
  }
}
