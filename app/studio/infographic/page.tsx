"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Download, ImagePlus, LayoutTemplate, Minus, Plus, RectangleHorizontal, RefreshCw, Square, X } from "lucide-react";
import PageShell from "@/components/ui/PageShell";
import Button from "@/components/ui/Button";
import { Card, SectionHeading, Well } from "@/components/ui/Surface";
import {
  DEFAULT_INFOGRAPHIC_STYLE,
  FONT_OPTIONS,
  INFOGRAPHIC_TEMPLATES,
  MARKETPLACE_PRESETS,
  clampCanvasDimension,
  normalizeFeatureLabel,
  scaleFromDesign,
  splitFeatureLabel,
  type InfographicShape,
  type InfographicStyle,
  type InfographicTemplate,
  type MarketplacePresetId,
  type ShapeKind,
} from "@/lib/infographic/layout";

type LocalImage = { file: File; url: string };
type FeatureState = { label: string; image: LocalImage | null };
const DEFAULT_FEATURES = ["Easy full-zip closure", "Flowy coverage", "Secure inner fit"];

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load an image used by the infographic."));
    image.src = src;
  });
}
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x:number,y:number,w:number,h:number) {
  const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight), sw=w/scale, sh=h/scale;
  ctx.drawImage(image,(image.naturalWidth-sw)/2,(image.naturalHeight-sh)/2,sw,sh,x,y,w,h);
}
function drawContain(ctx: CanvasRenderingContext2D,image:HTMLImageElement,x:number,y:number,w:number,h:number){
  const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight), dw=image.naturalWidth*scale, dh=image.naturalHeight*scale;
  ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function drawLabel(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,style:InfographicStyle,scale:number,align:CanvasTextAlign="right",maxChars=19){
  const lines=splitFeatureLabel(text,maxChars), size=style.fontSize*scale, lineHeight=size*1.12;
  ctx.save(); ctx.fillStyle=style.textColor; ctx.font=`${style.fontWeight} ${size}px ${style.fontFamily}`; ctx.textAlign=align; ctx.textBaseline="middle";
  const start=y-((lines.length-1)*lineHeight)/2; lines.forEach((line,i)=>ctx.fillText(line,x,start+i*lineHeight)); ctx.restore();
}
function drawLine(ctx:CanvasRenderingContext2D,x1:number,y:number,x2:number,dot:number,style:InfographicStyle,scale:number){
  ctx.save(); ctx.strokeStyle=style.accentColor; ctx.fillStyle=style.accentColor; ctx.lineWidth=5*scale;
  ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();ctx.beginPath();ctx.arc(dot,y,14*scale,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawShapes(ctx:CanvasRenderingContext2D,shapes:InfographicShape[],sx:number,sy:number){
  for(const shape of shapes){ const x=shape.x*sx,y=shape.y*sy,w=shape.width*sx,h=shape.height*sy; ctx.save();ctx.globalAlpha=shape.opacity;ctx.fillStyle=shape.fill;ctx.strokeStyle=shape.stroke;ctx.lineWidth=shape.strokeWidth*sx;
    if(shape.kind==="circle"){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    else if(shape.kind==="line"){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.stroke();}
    else {ctx.beginPath(); if(shape.kind==="rounded")ctx.roundRect(x,y,w,h,Math.min(30*sx,w/4,h/4)); else ctx.rect(x,y,w,h);ctx.fill();ctx.stroke();} ctx.restore();
  }
}
async function drawLogo(ctx:CanvasRenderingContext2D,w:number){
  try{const logo=await loadImage("/logo_megaska.png");const s=w/2000;ctx.save();ctx.fillStyle="#f3f516";ctx.beginPath();ctx.roundRect(76*s,70*s,150*s,150*s,22*s);ctx.fill();drawContain(ctx,logo,90*s,84*s,122*s,122*s);ctx.restore();}catch{}
}

export default function InfographicStudioPage(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [hero,setHero]=useState<LocalImage|null>(null);
  const [features,setFeatures]=useState<FeatureState[]>(DEFAULT_FEATURES.map(label=>({label,image:null})));
  const [template,setTemplate]=useState<InfographicTemplate>("hero-details");
  const [preset,setPreset]=useState<MarketplacePresetId>("amazon-square");
  const [canvasWidth,setCanvasWidth]=useState(2000),[canvasHeight,setCanvasHeight]=useState(2000);
  const [style,setStyle]=useState<InfographicStyle>(DEFAULT_INFOGRAPHIC_STYLE);
  const [variant,setVariant]=useState("");
  const [shapes,setShapes]=useState<InfographicShape[]>([]);
  const [status,setStatus]=useState("Upload a product image to begin."),[busy,setBusy]=useState(false);

  const choosePreset=(id:MarketplacePresetId)=>{
    setPreset(id); const p=MARKETPLACE_PRESETS.find(item=>item.id===id); if(p&&id!=="custom"){setCanvasWidth(p.width);setCanvasHeight(p.height);}
  };
  const setLocalImage=useCallback((file:File|undefined,target:"hero"|number)=>{
    if(!file?.type.startsWith("image/"))return; const next={file,url:URL.createObjectURL(file)};
    if(target==="hero"){setHero(old=>{if(old)URL.revokeObjectURL(old.url);return next;});return;}
    setFeatures(old=>old.map((f,i)=>i===target?{...f,image:next}:f));
  },[]);
  const addShape=(kind:ShapeKind)=>setShapes(old=>[...old,{id:crypto.randomUUID(),kind,x:700,y:700,width:kind==="line"?500:400,height:kind==="line"?0:220,fill:"#ffffff",stroke:style.accentColor,strokeWidth:6,opacity:.9}]);

  const render=useCallback(async()=>{
    if(!hero||!canvasRef.current){setStatus("Upload a hero product image first.");return;} setBusy(true);
    try{
      const canvas=canvasRef.current,ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas unavailable.");
      const W=clampCanvasDimension(canvasWidth),H=clampCanvasDimension(canvasHeight),sx=W/2000,sy=H/2000,s=Math.min(sx,sy);
      canvas.width=W;canvas.height=H;ctx.fillStyle=style.backgroundColor;ctx.fillRect(0,0,W,H);
      const hi=await loadImage(hero.url),details=await Promise.all(features.map(f=>loadImage(f.image?.url??hero.url)));
      const labels=features.map((f,i)=>normalizeFeatureLabel(f.label,DEFAULT_FEATURES[i]));
      if(template==="hero-details"){
        drawContain(ctx,hi,40*sx,120*sy,1190*sx,1780*sy);
        [70,620,1170].forEach((baseY,i)=>{const x=1420*sx,y=baseY*sy,w=500*sx,h=455*sy;ctx.fillStyle="#f4f4f4";ctx.fillRect(x,y,w,h);drawCover(ctx,details[i],x,y,w,h);drawLabel(ctx,labels[i],1355*sx,y+h/2,style,s,"right");drawLine(ctx,1375*sx,y+h/2,1565*sx,1565*sx,style,s);});
      } else if(template==="center-callouts"){
        drawContain(ctx,hi,410*sx,170*sy,1180*sx,1660*sy);
        const pos=[[320,520,"right",340,650,650],[1680,940,"left",1350,1660,1350],[320,1370,"right",340,650,650]] as const;
        pos.forEach((p,i)=>{drawLabel(ctx,labels[i],p[0]*sx,p[1]*sy,style,s,p[2],17);drawLine(ctx,p[3]*sx,p[1]*sy,p[4]*sx,p[5]*sx,style,s);});
      } else {
        drawContain(ctx,hi,190*sx,70*sy,1620*sx,1120*sy);
        features.forEach((_,i)=>{const x=(68+i*632)*sx,y=1280*sy,w=600*sx;ctx.fillStyle="#f3f3f3";ctx.fillRect(x,y,w,500*sy);drawCover(ctx,details[i],x,y,w,370*sy);ctx.fillStyle="#fff";ctx.fillRect(x,y+370*sy,w,130*sy);drawLabel(ctx,labels[i],x+w/2,y+435*sy,style,s,"center",18);});
      }
      drawShapes(ctx,shapes,sx,sy); await drawLogo(ctx,W);
      ctx.fillStyle=style.textColor;ctx.font=`800 ${58*s}px ${style.fontFamily}`;ctx.textAlign="right";ctx.fillText((variant||"MEGASKA").toUpperCase(),W-70*sx,H-65*sy);
      setStatus(`Ready · ${W} × ${H}px · verify marketplace requirements and product claims before upload.`);
    }catch(e){setStatus(e instanceof Error?e.message:"Render failed.");}finally{setBusy(false);}
  },[hero,features,template,canvasWidth,canvasHeight,style,variant,shapes]);

  useEffect(()=>{if(hero)void render();},[hero,template,preset,style,shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  const download=(type:"png"|"jpeg")=>{const c=canvasRef.current;if(!c||!hero)return;c.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`megaska-infographic-${canvasWidth}x${canvasHeight}.${type==="png"?"png":"jpg"}`;a.click();URL.revokeObjectURL(u);},`image/${type}`,.94);};

  const rail=<div className="space-y-4">
    <Card className="p-4"><SectionHeading title="1. Canvas" description="Marketplace presets are editable working sizes, not policy guarantees."/>
      <select value={preset} onChange={e=>choosePreset(e.target.value as MarketplacePresetId)} className="mt-3 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm">{MARKETPLACE_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label} · {p.width}×{p.height}</option>)}</select>
      <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Canvas width" type="number" min={500} max={5000} value={canvasWidth} onChange={e=>{setPreset("custom");setCanvasWidth(Number(e.target.value));}} className="rounded-lg border border-line bg-well px-3 py-2 text-sm"/><input aria-label="Canvas height" type="number" min={500} max={5000} value={canvasHeight} onChange={e=>{setPreset("custom");setCanvasHeight(Number(e.target.value));}} className="rounded-lg border border-line bg-well px-3 py-2 text-sm"/></div>
    </Card>
    <Card className="p-4"><SectionHeading title="2. Product & template" description="Use approved photography; generate close-ups separately in Image Project."/>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-well px-3 py-4 text-sm"><ImagePlus className="h-4 w-4"/>{hero?"Replace hero":"Upload hero"}<input className="sr-only" type="file" accept="image/*" onChange={e=>setLocalImage(e.target.files?.[0],"hero")}/></label>
      <select value={template} onChange={e=>setTemplate(e.target.value as InfographicTemplate)} className="mt-2 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm">{INFOGRAPHIC_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>
    </Card>
    <Card className="p-4"><SectionHeading title="3. Typography & color" description="Control the visual system without regenerating the product."/>
      <select value={style.fontFamily} onChange={e=>setStyle(v=>({...v,fontFamily:e.target.value}))} className="mt-3 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm">{FONT_OPTIONS.map(f=><option key={f.label} value={f.value}>{f.label}</option>)}</select>
      <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-ink-3">Size<input type="number" min={24} max={110} value={style.fontSize} onChange={e=>setStyle(v=>({...v,fontSize:Number(e.target.value)}))} className="mt-1 w-full rounded-lg border border-line bg-well px-2 py-2"/></label><label className="text-xs text-ink-3">Weight<select value={style.fontWeight} onChange={e=>setStyle(v=>({...v,fontWeight:Number(e.target.value)}))} className="mt-1 w-full rounded-lg border border-line bg-well px-2 py-2"><option value="400">Regular</option><option value="600">Semi bold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label></div>
      <div className="mt-3 grid grid-cols-3 gap-2">{([["Text","textColor"],["Accent","accentColor"],["Canvas","backgroundColor"]] as const).map(([label,key])=><label key={key} className="text-xs text-ink-3">{label}<input type="color" value={style[key]} onChange={e=>setStyle(v=>({...v,[key]:e.target.value}))} className="mt-1 h-9 w-full rounded border border-line"/></label>)}</div>
    </Card>
    <Card className="p-4"><SectionHeading title="4. Feature callouts" description="Add optional close-up images from Image Project."/><div className="mt-3 space-y-3">{features.map((f,i)=><Well key={i} className="p-2"><input value={f.label} maxLength={64} onChange={e=>setFeatures(old=>old.map((x,j)=>j===i?{...x,label:e.target.value}:x))} className="w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm"/><label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs"><ImagePlus className="h-3 w-3"/>{f.image?"Replace detail":"Detail image"}<input className="sr-only" type="file" accept="image/*" onChange={e=>setLocalImage(e.target.files?.[0],i)}/></label></Well>)}</div><input value={variant} onChange={e=>setVariant(e.target.value)} placeholder="Variant / color label" className="mt-3 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm"/></Card>
    <Card className="p-4"><SectionHeading title="5. Shapes" description="Add simple graphic elements; they render above the template."/><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>addShape("rectangle")}><RectangleHorizontal className="h-4 w-4"/>Rectangle</Button><Button variant="secondary" onClick={()=>addShape("rounded")}><Square className="h-4 w-4"/>Rounded</Button><Button variant="secondary" onClick={()=>addShape("circle")}><Circle className="h-4 w-4"/>Circle</Button><Button variant="secondary" onClick={()=>addShape("line")}><Minus className="h-4 w-4"/>Line</Button></div>{shapes.map((sh,i)=><Well key={sh.id} className="mt-2 p-2"><div className="flex items-center justify-between text-xs"><span>{sh.kind} {i+1}</span><button onClick={()=>setShapes(v=>v.filter(x=>x.id!==sh.id))}><X className="h-3 w-3"/></button></div><div className="mt-2 grid grid-cols-2 gap-1">{(["x","y","width","height"] as const).map(k=><input key={k} aria-label={k} type="number" value={Math.round(sh[k])} onChange={e=>setShapes(v=>v.map(x=>x.id===sh.id?{...x,[k]:Number(e.target.value)}:x))} className="w-full rounded border border-line bg-surface px-2 py-1 text-xs"/>)}</div><div className="mt-2 flex gap-2"><input aria-label="Shape fill" type="color" value={sh.fill} onChange={e=>setShapes(v=>v.map(x=>x.id===sh.id?{...x,fill:e.target.value}:x))}/><input aria-label="Shape stroke" type="color" value={sh.stroke} onChange={e=>setShapes(v=>v.map(x=>x.id===sh.id?{...x,stroke:e.target.value}:x))}/></div></Well>)}</Card>
    <div className="flex flex-wrap gap-2"><Button onClick={()=>void render()} disabled={!hero||busy}>{busy?<RefreshCw className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}Render</Button><Button variant="secondary" onClick={()=>download("png")} disabled={!hero}><Download className="h-4 w-4"/>PNG</Button><Button variant="secondary" onClick={()=>download("jpeg")} disabled={!hero}><Download className="h-4 w-4"/>JPG</Button></div>
  </div>;

  return <PageShell accent="violet" eyebrow="Marketplace creative" title="Infographic Studio" description="Compose product photography, feature callouts, brand styling and simple shapes for different marketplace aspect ratios." rail={rail}>
    <Card className="overflow-hidden p-4"><SectionHeading title="Live preview" description={status}/><div className="mt-4 flex min-h-[520px] items-center justify-center overflow-auto rounded-xl border border-line bg-well p-3">{hero?<canvas ref={canvasRef} className="h-auto max-h-[75vh] max-w-full bg-white shadow-raised"/>:<div className="max-w-sm text-center"><LayoutTemplate className="mx-auto h-8 w-8 text-ink-3"/><p className="mt-3 text-sm font-medium">Upload a product image to start</p></div>}</div></Card>
    <Well className="p-4"><p className="text-sm font-medium">Image generation stays in Image Project</p><p className="mt-1 text-xs leading-relaxed text-ink-3">Create zipper close-ups, stretch demonstrations and other generated supporting visuals there, then import approved outputs here for composition. This editor does not alter garment construction.</p></Well>
  </PageShell>;
}
