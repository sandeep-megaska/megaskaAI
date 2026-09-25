import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ExhaustionKind = "quota" | "capacity" | "rate_limit" | "unknown";

function errorMeta(error: unknown) {
  const value=error as {status?:number;code?:number|string;message?:string;error?:{status?:string;code?:string;message?:string};details?:unknown};
  const status=typeof value?.status==="number"?value.status:typeof value?.code==="number"?value.code:undefined;
  const code=String(value?.error?.status??value?.error?.code??(typeof value?.code==="string"?value.code:""));
  const message=String(value?.error?.message??value?.message??"");
  return {status,code,message,raw:value};
}

export function classifyProviderExhaustion(error:unknown):ExhaustionKind|null{
  const {status,code,message}=errorMeta(error);
  const text=`${code} ${message} ${JSON.stringify((error as {details?:unknown})?.details??"")}`.toLowerCase();
  if(status!==429&&!text.includes("resource_exhausted")&&!text.includes("rate limit")&&!text.includes("quota"))return null;
  if(text.includes("quota")||text.includes("per day")||text.includes("rpd")||text.includes("tpm")||text.includes("rpm")||text.includes("spend"))return "quota";
  if(text.includes("capacity")||text.includes("shared")||text.includes("overloaded")||text.includes("try again later"))return "capacity";
  if(text.includes("too many requests")||text.includes("rate_limit")||text.includes("rate limit"))return "rate_limit";
  return "unknown";
}

function retryable(error:unknown){
  const {status,code,message}=errorMeta(error); const text=`${code} ${message}`.toUpperCase();
  return status===408||status===429||(status??0)>=500||text.includes("RESOURCE_EXHAUSTED")||text.includes("UNAVAILABLE");
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function event(row:Record<string,unknown>){
  try{await getSupabaseAdminClient().from("provider_request_events").insert(row);}catch(error){console.warn("[provider-resilience] telemetry failed",error);}
}
async function acquire(provider:string,model:string,operation:string,limit:number){
  const db=getSupabaseAdminClient();
  for(let wait=0;wait<20;wait+=1){
    const {data,error}=await db.rpc("acquire_provider_request_lease",{p_provider:provider,p_model:model,p_operation:operation,p_limit:limit,p_ttl_seconds:180});
    if(error){console.warn("[provider-resilience] lease unavailable; continuing without distributed limit",error);return null;}
    if(data)return String(data);
    await sleep(250+Math.floor(Math.random()*250));
  }
  throw new Error("Generation capacity is busy. Please retry in a moment.");
}
async function release(id:string|null){if(!id)return;try{await getSupabaseAdminClient().rpc("release_provider_request_lease",{p_id:id});}catch{}}

export async function withProviderResilience<T>(input:{provider:"gemini";model:string;operation:string;concurrency?:number;maxAttempts?:number},run:()=>Promise<T>):Promise<T>{
  const lease=await acquire(input.provider,input.model,input.operation,input.concurrency??Number(process.env.GEMINI_MODEL_CONCURRENCY??3));
  try{
    const max=Math.max(1,input.maxAttempts??4);
    for(let attempt=1;attempt<=max;attempt+=1){
      const started=Date.now();
      try{
        const result=await run();
        await event({provider:input.provider,model:input.model,operation:input.operation,status:"success",attempt,latency_ms:Date.now()-started});
        return result;
      }catch(error){
        const meta=errorMeta(error); const kind=classifyProviderExhaustion(error);
        await event({provider:input.provider,model:input.model,operation:input.operation,status:"error",http_status:meta.status??null,error_code:meta.code||null,exhaustion_kind:kind,attempt,latency_ms:Date.now()-started});
        if(!retryable(error)||attempt===max)throw error;
        const base=Math.min(8000,1000*2**(attempt-1));
        await sleep(base+Math.floor(Math.random()*Math.max(250,base*.35)));
      }
    }
    throw new Error("Provider request failed.");
  }finally{await release(lease);}
}
