import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { AI_BACKENDS } from "@/lib/ai-backends";

export const runtime="nodejs";
export async function GET(){
  const db=getSupabaseAdminClient();
  const since=new Date(Date.now()-24*60*60*1000).toISOString();
  const [{data:events,error},{data:leases}]=await Promise.all([
    db.from("provider_request_events").select("provider,model,operation,status,http_status,error_code,exhaustion_kind,attempt,latency_ms,created_at").gte("created_at",since).order("created_at",{ascending:false}).limit(2000),
    db.from("provider_request_leases").select("provider,model,expires_at").gt("expires_at",new Date().toISOString()),
  ]);
  if(error)return NextResponse.json({success:false,error:error.message},{status:500});
  const models=[...new Set(AI_BACKENDS.filter(b=>!b.isRetired&&b.id!=="laozhang_gemini").map(b=>b.model))];
  const rows=models.map(model=>{
    const relevant=(events??[]).filter(e=>e.model===model);
    const errors=relevant.filter(e=>e.status==="error");
    const exhausted=errors.filter(e=>e.http_status===429||e.exhaustion_kind);
    const kinds=exhausted.reduce<Record<string,number>>((a,e)=>{const k=e.exhaustion_kind||"unknown";a[k]=(a[k]||0)+1;return a;},{});
    const latency=relevant.filter(e=>typeof e.latency_ms==="number").map(e=>e.latency_ms as number);
    return {model,requests:relevant.length,successes:relevant.filter(e=>e.status==="success").length,errors:errors.length,exhausted:exhausted.length,exhaustionKinds:kinds,avgLatencyMs:latency.length?Math.round(latency.reduce((a,b)=>a+b,0)/latency.length):null,active:Number((leases??[]).filter(l=>l.model===model).length),guardrailConcurrency:Number(process.env.GEMINI_MODEL_CONCURRENCY??3),latestError:errors[0]??null};
  });
  return NextResponse.json({success:true,windowHours:24,models:rows,limits:{source:"configured-guardrail",note:"Google does not expose this app's live Gemini API model quotas through the generation API. Authoritative active limits remain in Google AI Studio / Google Cloud quota consoles."}});
}
