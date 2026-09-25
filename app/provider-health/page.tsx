"use client";
import { useEffect,useState } from "react";
import PageShell from "@/components/ui/PageShell";
import { Card,SectionHeading } from "@/components/ui/Surface";

type Row={model:string;requests:number;successes:number;errors:number;exhausted:number;exhaustionKinds:Record<string,number>;avgLatencyMs:number|null;active:number;guardrailConcurrency:number;latestError?:{created_at:string;error_code?:string;exhaustion_kind?:string}|null};
export default function ProviderHealthPage(){
 const [rows,setRows]=useState<Row[]>([]); const [error,setError]=useState<string|null>(null);
 useEffect(()=>{fetch("/api/provider-health").then(r=>r.json()).then(p=>{if(!p.success)throw new Error(p.error);setRows(p.models??[])}).catch(e=>setError(e instanceof Error?e.message:"Unable to load provider health."));},[]);
 return <PageShell accent="violet" eyebrow="Operations" title="AI Provider Health" description="Observed model traffic, concurrency and RESOURCE_EXHAUSTED diagnosis from Megaska AI.">
  <div className="space-y-4">
   <Card className="p-4"><SectionHeading title="How to read this"/><p className="mt-2 text-sm text-ink-2">Quota means Google returned evidence of a quota/rate/spend limit. Capacity means the response indicated shared/provider capacity pressure. Unknown means Google returned 429 without enough detail to prove which one. The concurrency number is our own safety guardrail, not Google's quota.</p><p className="mt-2 text-xs text-ink-3">Google's authoritative active Gemini model limits are shown in Google AI Studio / Google Cloud quota consoles; the generation API does not provide a reliable live quota-limit feed for this dashboard.</p></Card>
   {error?<Card className="p-4 text-sm text-danger">{error}</Card>:null}
   <Card className="overflow-x-auto p-4"><SectionHeading title="Last 24 hours"/><table className="mt-3 w-full min-w-[850px] text-left text-xs"><thead className="text-ink-3"><tr><th className="py-2">Model</th><th>Requests</th><th>Errors</th><th>429/exhausted</th><th>Diagnosis</th><th>Active</th><th>Guardrail</th><th>Avg latency</th></tr></thead><tbody>{rows.map(r=><tr key={r.model} className="border-t border-line"><td className="py-3 font-medium text-ink">{r.model}</td><td>{r.requests}</td><td>{r.errors}</td><td>{r.exhausted}</td><td>{Object.entries(r.exhaustionKinds).map(([k,v])=>`${k}: ${v}`).join(" · ")||"—"}</td><td>{r.active}</td><td>{r.guardrailConcurrency}</td><td>{r.avgLatencyMs===null?"—":`${r.avgLatencyMs} ms`}</td></tr>)}</tbody></table></Card>
  </div>
 </PageShell>;
}
