"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Circle, Copy, Download, Eye, EyeOff, Group, ImagePlus, Lock, Minus, MousePointer2,
  Redo2, RotateCw, Square, Trash2, Triangle, Type, Ungroup, Undo2, Unlock, ZoomIn, ZoomOut,
} from "lucide-react";
import PageShell from "@/components/ui/PageShell";
import Button from "@/components/ui/Button";
import { Card, SectionHeading, Well } from "@/components/ui/Surface";
import { FONT_OPTIONS, MARKETPLACE_PRESETS, clampCanvasDimension, type MarketplacePresetId } from "@/lib/infographic/layout";
import {
  alignmentGuides, clampCropOffset, clampCropZoom, clampZoom, createId, duplicateElements, expandSelectionToGroups, groupElements, moveElement, reorderElement, resizeElement, rotateElement, snapValue, ungroupElements,
  type EditorDocument, type EditorElement, type EditorImageElement, type EditorShapeElement, type EditorTextElement,
} from "@/lib/infographic/editor";

type History = { past: EditorDocument[]; present: EditorDocument; future: EditorDocument[] };
type DragState = { id:string; mode:"move"|"resize"|"rotate"; startX:number; startY:number; original:EditorElement };

const initialDocument: EditorDocument = { width:2000, height:2000, background:"#ffffff", elements:[] };
const makeHistory=(present:EditorDocument):History=>({past:[],present,future:[]});

function imageFile(file:File){ return { src:URL.createObjectURL(file), name:file.name }; }

export default function InfographicStudioPage(){
  const [history,setHistory]=useState<History>(()=>makeHistory(initialDocument));
  const doc=history.present;
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [preset,setPreset]=useState<MarketplacePresetId>("amazon-square");
  const [zoom,setZoom]=useState(.38);
  const [snap,setSnap]=useState(true);
  const [drag,setDrag]=useState<DragState|null>(null);
  const [status,setStatus]=useState("Add an image, text or shape to begin.");
  const [guides,setGuides]=useState<{axis:"x"|"y";value:number}[]>([]);
  const canvasRef=useRef<HTMLDivElement>(null);

  const selected=useMemo(()=>doc.elements.find(e=>e.id===selectedIds[selectedIds.length-1])??null,[doc.elements,selectedIds]);
  const commit=useCallback((next:EditorDocument)=>{
    setHistory(h=>({past:[...h.past.slice(-49),h.present],present:next,future:[]}));
  },[]);
  const patchElement=useCallback((id:string, patch:Partial<EditorElement>, record=true)=>{
    const next={...doc,elements:doc.elements.map(e=>e.id===id?({...e,...patch} as EditorElement):e)};
    if(record) commit(next); else setHistory(h=>({...h,present:next}));
  },[doc,commit]);
  const undo=()=>setHistory(h=>h.past.length?{past:h.past.slice(0,-1),present:h.past[h.past.length-1],future:[h.present,...h.future]}:h);
  const redo=()=>setHistory(h=>h.future.length?{past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h);

  const addText=()=>{
    const e:EditorTextElement={id:createId("text"),name:"Heading",kind:"text",x:240,y:240,width:900,height:180,rotation:0,opacity:1,visible:true,locked:false,text:"PRODUCT FEATURE",fontFamily:"Arial, Helvetica, sans-serif",fontSize:92,fontWeight:800,color:"#111111",align:"left",italic:false,uppercase:false,lineHeight:1.05,letterSpacing:0,backgroundColor:"transparent",shadowColor:"#000000",shadowBlur:0,shadowX:0,shadowY:0};
    commit({...doc,elements:[...doc.elements,e]});setSelectedIds([e.id]);
  };
  const addShape=(shape:EditorShapeElement["shape"])=>{
    const e:EditorShapeElement={id:createId("shape"),name:shape,kind:"shape",shape,x:500,y:500,width:500,height:280,rotation:0,opacity:1,visible:true,locked:false,fill:shape==="line"?"transparent":"#f3f516",stroke:"#111111",strokeWidth:4};
    commit({...doc,elements:[...doc.elements,e]});setSelectedIds([e.id]);
  };
  const addImage=(file?:File)=>{
    if(!file?.type.startsWith("image/"))return;const asset=imageFile(file);
    const e:EditorImageElement={id:createId("image"),name:asset.name,kind:"image",x:220,y:220,width:1100,height:1450,rotation:0,opacity:1,visible:true,locked:false,src:asset.src,fit:"contain",cropX:0,cropY:0,cropZoom:1,borderRadius:0,flipX:false,flipY:false};
    commit({...doc,elements:[...doc.elements,e]});setSelectedIds([e.id]);
  };
  const removeSelected=()=>{if(!selectedIds.length)return;const ids=new Set(expandSelectionToGroups(doc.elements,selectedIds));commit({...doc,elements:doc.elements.filter(e=>!ids.has(e.id)||e.locked)});setSelectedIds([]);};
  const duplicateSelected=()=>{if(!selectedIds.length)return;const ids=expandSelectionToGroups(doc.elements,selectedIds);const result=duplicateElements(doc.elements,ids);commit({...doc,elements:result.elements});setSelectedIds(result.ids);};\n  const groupSelected=()=>{if(selectedIds.length<2)return;commit({...doc,elements:groupElements(doc.elements,selectedIds)});};\n  const ungroupSelected=()=>{if(!selectedIds.length)return;commit({...doc,elements:ungroupElements(doc.elements,selectedIds)});};
  const reorder=(direction:"forward"|"backward")=>selected&&commit({...doc,elements:reorderElement(doc.elements,selected.id,direction)});
  const choosePreset=(id:MarketplacePresetId)=>{
    setPreset(id);const p=MARKETPLACE_PRESETS.find(x=>x.id===id);if(p&&id!=="custom")commit({...doc,width:p.width,height:p.height});
  };

  const beginPointer=(event:React.PointerEvent,id:string,mode:DragState["mode"])=>{
    event.stopPropagation();const element=doc.elements.find(e=>e.id===id);if(!element||element.locked)return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setSelectedIds(event.shiftKey?Array.from(new Set([...selectedIds,id])):expandSelectionToGroups(doc.elements,[id]));setDrag({id,mode,startX:event.clientX,startY:event.clientY,original:element});
  };
  const pointerMove=(event:React.PointerEvent)=>{
    if(!drag)return;const dx=(event.clientX-drag.startX)/zoom,dy=(event.clientY-drag.startY)/zoom;
    if(drag.mode==="move"){const sx=snapValue(dx,10,snap),sy=snapValue(dy,10,snap);const activeIds=expandSelectionToGroups(doc.elements,selectedIds.length?selectedIds:[drag.id]);setHistory(h=>({...h,present:{...h.present,elements:h.present.elements.map(e=>activeIds.includes(e.id)?moveElement(e.id===drag.id?drag.original:e,sx,sy):e)}}));const moved=moveElement(drag.original,sx,sy);setGuides(alignmentGuides(moved,{...doc,elements:doc.elements},12/zoom));}
    if(drag.mode==="resize"){const resized=resizeElement(drag.original,snapValue(drag.original.width+dx,10,snap),snapValue(drag.original.height+dy,10,snap));patchElement(drag.id,{width:resized.width,height:resized.height},false);}
    if(drag.mode==="rotate"){const rotated=rotateElement(drag.original,drag.original.rotation+dx/2);patchElement(drag.id,{rotation:rotated.rotation},false);}
  };
  const pointerUp=()=>{if(!drag)return;setGuides([]);setHistory(h=>({past:[...h.past.slice(-49),{...h.present,elements:h.present.elements.map(e=>e.id===drag.id?drag.original:e)}],present:h.present,future:[]}));setDrag(null);};

  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement;if(["INPUT","TEXTAREA","SELECT"].includes(target.tagName))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"){e.preventDefault();duplicateSelected();return;}
      if((e.key==="Delete"||e.key==="Backspace")&&selected){e.preventDefault();removeSelected();return;}
      if(selected&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();const step=e.shiftKey?10:1;const dx=e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0,dy=e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0;const moved=moveElement(selected,dx,dy);patchElement(selected.id,{x:moved.x,y:moved.y});}
    };window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  });

  const exportImage=async()=>{
    const canvas=document.createElement("canvas");canvas.width=doc.width;canvas.height=doc.height;const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.fillStyle=doc.background;ctx.fillRect(0,0,doc.width,doc.height);
    for(const e of doc.elements){if(!e.visible)continue;ctx.save();ctx.globalAlpha=e.opacity;ctx.translate(e.x+e.width/2,e.y+e.height/2);ctx.rotate(e.rotation*Math.PI/180);ctx.translate(-e.width/2,-e.height/2);
      if(e.kind==="shape"){ctx.fillStyle=e.fill;ctx.strokeStyle=e.stroke;ctx.lineWidth=e.strokeWidth;if(e.shape==="circle"){ctx.beginPath();ctx.ellipse(e.width/2,e.height/2,e.width/2,e.height/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}else if(e.shape==="line"||e.shape==="arrow"){ctx.beginPath();ctx.moveTo(0,e.height/2);ctx.lineTo(e.width,e.height/2);ctx.stroke();if(e.shape==="arrow"){ctx.beginPath();ctx.moveTo(e.width,e.height/2);ctx.lineTo(e.width-40,e.height/2-24);ctx.lineTo(e.width-40,e.height/2+24);ctx.closePath();ctx.fillStyle=e.stroke;ctx.fill();}}else if(e.shape==="triangle"){ctx.beginPath();ctx.moveTo(e.width/2,0);ctx.lineTo(e.width,e.height);ctx.lineTo(0,e.height);ctx.closePath();ctx.fill();ctx.stroke();}else{ctx.beginPath();e.shape==="rounded"?ctx.roundRect(0,0,e.width,e.height,40):ctx.rect(0,0,e.width,e.height);ctx.fill();ctx.stroke();}}
      if(e.kind==="text"){ctx.fillStyle=e.color;ctx.font=`${e.italic?"italic ":""}${e.fontWeight} ${e.fontSize}px ${e.fontFamily}`;ctx.textBaseline="top";ctx.textAlign=e.align;ctx.shadowColor=e.shadowColor;ctx.shadowBlur=e.shadowBlur;ctx.shadowOffsetX=e.shadowX;ctx.shadowOffsetY=e.shadowY;const x=e.align==="left"?0:e.align==="center"?e.width/2:e.width;ctx.fillText(e.uppercase?e.text.toUpperCase():e.text,x,0,e.width);}
      if(e.kind==="image"){const img=new Image();img.src=e.src;await img.decode();const scale=(e.fit==="contain"?Math.min(e.width/img.naturalWidth,e.height/img.naturalHeight):Math.max(e.width/img.naturalWidth,e.height/img.naturalHeight))*e.cropZoom;const w=img.naturalWidth*scale,h=img.naturalHeight*scale;ctx.save();ctx.beginPath();ctx.roundRect(0,0,e.width,e.height,e.borderRadius);ctx.clip();ctx.translate(e.flipX?e.width:0,e.flipY?e.height:0);ctx.scale(e.flipX?-1:1,e.flipY?-1:1);ctx.drawImage(img,(e.width-w)/2+e.cropX/100*e.width,(e.height-h)/2+e.cropY/100*e.height,w,h);ctx.restore();}
      ctx.restore();
    }
    canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`megaska-creative-${doc.width}x${doc.height}.png`;a.click();URL.revokeObjectURL(url);},"image/png");setStatus("PNG exported.");
  };

  const inspector=selected?<Card className="p-4"><SectionHeading title="Properties" description={selected.name}/>
    <label className="mt-3 block text-xs text-ink-3">Name<input value={selected.name} onChange={e=>patchElement(selected.id,{name:e.target.value})} className="mt-1 w-full rounded border border-line bg-well px-2 py-2 text-sm"/></label>
    <div className="mt-2 grid grid-cols-2 gap-2">{(["x","y","width","height","rotation"] as const).map(k=><label key={k} className="text-xs text-ink-3">{k}<input type="number" value={Math.round(selected[k])} onChange={e=>patchElement(selected.id,{[k]:Number(e.target.value)})} className="mt-1 w-full rounded border border-line bg-well px-2 py-2 text-sm"/></label>)}</div>
    <label className="mt-2 block text-xs text-ink-3">Opacity {Math.round(selected.opacity*100)}%<input type="range" min="0" max="1" step=".05" value={selected.opacity} onChange={e=>patchElement(selected.id,{opacity:Number(e.target.value)})} className="w-full"/></label>
    {selected.kind==="text"?<><textarea value={selected.text} onChange={e=>patchElement(selected.id,{text:e.target.value})} className="mt-3 w-full rounded border border-line bg-well p-2 text-sm"/><select value={selected.fontFamily} onChange={e=>patchElement(selected.id,{fontFamily:e.target.value})} className="mt-2 w-full rounded border border-line bg-well px-2 py-2 text-sm">{FONT_OPTIONS.map(f=><option key={f.label} value={f.value}>{f.label}</option>)}</select><div className="mt-2 grid grid-cols-2 gap-2"><input type="number" value={selected.fontSize} onChange={e=>patchElement(selected.id,{fontSize:Number(e.target.value)})} className="rounded border border-line bg-well px-2 py-2"/><input type="color" value={selected.color} onChange={e=>patchElement(selected.id,{color:e.target.value})} className="h-10 w-full"/></div><div className="mt-2 grid grid-cols-3 gap-2"><select value={selected.align} onChange={e=>patchElement(selected.id,{align:e.target.value as "left"|"center"|"right"})} className="rounded border border-line bg-well px-2 py-2 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select><Button variant="secondary" onClick={()=>patchElement(selected.id,{italic:!selected.italic})}>{selected.italic?"Italic ✓":"Italic"}</Button><Button variant="secondary" onClick={()=>patchElement(selected.id,{uppercase:!selected.uppercase})}>Aa</Button></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-ink-3">Line height<input type="number" min=".7" max="3" step=".05" value={selected.lineHeight} onChange={e=>patchElement(selected.id,{lineHeight:Number(e.target.value)})} className="mt-1 w-full rounded border border-line bg-well px-2 py-2"/></label><label className="text-xs text-ink-3">Letter spacing<input type="number" min="-10" max="40" value={selected.letterSpacing} onChange={e=>patchElement(selected.id,{letterSpacing:Number(e.target.value)})} className="mt-1 w-full rounded border border-line bg-well px-2 py-2"/></label></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-ink-3">Shadow blur<input type="number" min="0" max="50" value={selected.shadowBlur} onChange={e=>patchElement(selected.id,{shadowBlur:Number(e.target.value)})} className="mt-1 w-full rounded border border-line bg-well px-2 py-2"/></label><label className="text-xs text-ink-3">Shadow<input type="color" value={selected.shadowColor} onChange={e=>patchElement(selected.id,{shadowColor:e.target.value})} className="mt-1 h-9 w-full"/></label></div></>:null}
    {selected.kind==="shape"?<div className="mt-3 flex gap-3"><label className="text-xs">Fill<input type="color" value={selected.fill==="transparent"?"#ffffff":selected.fill} onChange={e=>patchElement(selected.id,{fill:e.target.value})}/></label><label className="text-xs">Stroke<input type="color" value={selected.stroke} onChange={e=>patchElement(selected.id,{stroke:e.target.value})}/></label></div>:null}
    {selected.kind==="image"?<><select value={selected.fit} onChange={e=>patchElement(selected.id,{fit:e.target.value as "contain"|"cover"})} className="mt-3 w-full rounded border border-line bg-well px-2 py-2 text-sm"><option value="contain">Contain</option><option value="cover">Cover / crop</option></select><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-ink-3">Crop X<input type="range" min="-100" max="100" value={selected.cropX} onChange={e=>patchElement(selected.id,{cropX:clampCropOffset(Number(e.target.value))})} className="w-full"/></label><label className="text-xs text-ink-3">Crop Y<input type="range" min="-100" max="100" value={selected.cropY} onChange={e=>patchElement(selected.id,{cropY:clampCropOffset(Number(e.target.value))})} className="w-full"/></label><label className="text-xs text-ink-3">Zoom {selected.cropZoom.toFixed(1)}×<input type="range" min="1" max="4" step=".1" value={selected.cropZoom} onChange={e=>patchElement(selected.id,{cropZoom:clampCropZoom(Number(e.target.value))})} className="w-full"/></label><label className="text-xs text-ink-3">Radius<input type="number" min="0" max="300" value={selected.borderRadius} onChange={e=>patchElement(selected.id,{borderRadius:Number(e.target.value)})} className="mt-1 w-full rounded border border-line bg-well px-2 py-2"/></label></div><div className="mt-2 flex gap-2"><Button variant="secondary" onClick={()=>patchElement(selected.id,{flipX:!selected.flipX})}>Flip H</Button><Button variant="secondary" onClick={()=>patchElement(selected.id,{flipY:!selected.flipY})}>Flip V</Button></div></>:null}
  </Card>:<Card className="p-4"><SectionHeading title="Properties" description="Select an object on the canvas."/></Card>;

  const rail=<div className="space-y-4">
    <Card className="p-4"><SectionHeading title="Canvas" description="Choose output size and background."/><select value={preset} onChange={e=>choosePreset(e.target.value as MarketplacePresetId)} className="mt-3 w-full rounded border border-line bg-well px-2 py-2 text-sm">{MARKETPLACE_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label} · {p.width}×{p.height}</option>)}</select><div className="mt-2 grid grid-cols-2 gap-2"><input type="number" value={doc.width} onChange={e=>{setPreset("custom");commit({...doc,width:clampCanvasDimension(Number(e.target.value))})}} className="rounded border border-line bg-well px-2 py-2"/><input type="number" value={doc.height} onChange={e=>{setPreset("custom");commit({...doc,height:clampCanvasDimension(Number(e.target.value))})}} className="rounded border border-line bg-well px-2 py-2"/></div><label className="mt-2 flex items-center gap-2 text-xs">Background <input type="color" value={doc.background} onChange={e=>commit({...doc,background:e.target.value})}/></label></Card>
    <Card className="p-4"><SectionHeading title="Add" description="Every object is independently editable."/><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={addText}><Type className="h-4 w-4"/>Text</Button><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><ImagePlus className="h-4 w-4"/>Image<input type="file" accept="image/*" className="sr-only" onChange={e=>addImage(e.target.files?.[0])}/></label><Button variant="secondary" onClick={()=>addShape("rectangle")}><Square className="h-4 w-4"/>Box</Button><Button variant="secondary" onClick={()=>addShape("circle")}><Circle className="h-4 w-4"/>Circle</Button><Button variant="secondary" onClick={()=>addShape("line")}><Minus className="h-4 w-4"/>Line</Button><Button variant="secondary" onClick={()=>addShape("arrow")}><ArrowUp className="h-4 w-4 rotate-90"/>Arrow</Button><Button variant="secondary" onClick={()=>addShape("triangle")}><Triangle className="h-4 w-4"/>Triangle</Button><Button variant="secondary" onClick={()=>addShape("badge")}><Circle className="h-4 w-4"/>Badge</Button><Button variant="secondary" onClick={()=>addShape("rounded")}><Square className="h-4 w-4"/>Rounded</Button></div></Card>
    {inspector}
    <Card className="p-4"><SectionHeading title="Layers" description="Top item renders in front."/><div className="mt-3 space-y-1">{[...doc.elements].reverse().map(e=><button key={e.id} onClick={()=>setSelectedIds([e.id])} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${selectedIds.includes(e.id)?"bg-accent/10 text-ink":"bg-well text-ink-2"}`}><span onClick={ev=>{ev.stopPropagation();patchElement(e.id,{visible:!e.visible})}}>{e.visible?<Eye className="h-3 w-3"/>:<EyeOff className="h-3 w-3"/>}</span><span className="min-w-0 flex-1 truncate">{e.name}</span><span onClick={ev=>{ev.stopPropagation();patchElement(e.id,{locked:!e.locked})}}>{e.locked?<Lock className="h-3 w-3"/>:<Unlock className="h-3 w-3"/>}</span></button>)}</div></Card>
  </div>;

  return <PageShell accent="violet" eyebrow="Product Creative Studio" title="Infographic Canvas Editor" description="A focused e-commerce design canvas: independent layers, direct manipulation, undo/redo, marketplace sizes and export." rail={rail}>
    <Card className="p-3"><div className="flex flex-wrap items-center gap-2 border-b border-line pb-3"><Button variant="secondary" onClick={undo} disabled={!history.past.length}><Undo2 className="h-4 w-4"/></Button><Button variant="secondary" onClick={redo} disabled={!history.future.length}><Redo2 className="h-4 w-4"/></Button><Button variant="secondary" onClick={duplicateSelected} disabled={!selectedIds.length}><Copy className="h-4 w-4"/>Duplicate</Button><Button variant="secondary" onClick={removeSelected} disabled={!selectedIds.length}><Trash2 className="h-4 w-4"/></Button><Button variant="secondary" onClick={groupSelected} disabled={selectedIds.length<2}><Group className="h-4 w-4"/>Group</Button><Button variant="secondary" onClick={ungroupSelected} disabled={!selectedIds.length}><Ungroup className="h-4 w-4"/>Ungroup</Button><Button variant="secondary" onClick={()=>reorder("forward")} disabled={!selected}><ArrowUp className="h-4 w-4"/>Forward</Button><Button variant="secondary" onClick={()=>reorder("backward")} disabled={!selected}><ArrowDown className="h-4 w-4"/>Backward</Button><label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Snap</label><Button variant="secondary" onClick={()=>setZoom(z=>clampZoom(z-.1))}><ZoomOut className="h-4 w-4"/></Button><span className="text-xs">{Math.round(zoom*100)}%</span><Button variant="secondary" onClick={()=>setZoom(z=>clampZoom(z+.1))}><ZoomIn className="h-4 w-4"/></Button><Button onClick={()=>void exportImage()}><Download className="h-4 w-4"/>PNG</Button></div>
      <div className="mt-3 overflow-auto rounded-xl bg-well p-8" style={{maxHeight:"78vh"}} onPointerMove={pointerMove} onPointerUp={pointerUp}>
        <div ref={canvasRef} onPointerDown={()=>setSelectedIds([])} className="relative mx-auto origin-top-left shadow-raised" style={{width:doc.width*zoom,height:doc.height*zoom,background:doc.background}}>
          {guides.map((g,i)=>g.axis==="x"?<div key={`gx-${i}`} className="pointer-events-none absolute top-0 z-50 h-full w-px bg-fuchsia-500" style={{left:g.value*zoom}}/>:<div key={`gy-${i}`} className="pointer-events-none absolute left-0 z-50 h-px w-full bg-fuchsia-500" style={{top:g.value*zoom}}/>)}{doc.elements.map(e=>e.visible?<div key={e.id} onPointerDown={ev=>beginPointer(ev,e.id,"move")} className={`absolute select-none ${selectedIds.includes(e.id)?"outline outline-2 outline-blue-500":""} ${e.locked?"cursor-not-allowed":"cursor-move"}`} style={{left:e.x*zoom,top:e.y*zoom,width:e.width*zoom,height:e.height*zoom,opacity:e.opacity,transform:`rotate(${e.rotation}deg)`,transformOrigin:"center"}}>
            {e.kind==="image"?<img src={e.src} alt="" draggable={false} className={`h-full w-full ${e.fit==="cover"?"object-cover":"object-contain"}`} style={{borderRadius:e.borderRadius*zoom,transform:`translate(${e.cropX*zoom}px, ${e.cropY*zoom}px) scale(${e.cropZoom}) scaleX(${e.flipX?-1:1}) scaleY(${e.flipY?-1:1})`}}/>:null}
            {e.kind==="text"?<div className="h-full w-full whitespace-pre-wrap" style={{fontFamily:e.fontFamily,fontSize:e.fontSize*zoom,fontWeight:e.fontWeight,fontStyle:e.italic?"italic":"normal",color:e.color,textAlign:e.align,lineHeight:e.lineHeight,letterSpacing:e.letterSpacing*zoom,background:e.backgroundColor,textShadow:e.shadowBlur?`${e.shadowX*zoom}px ${e.shadowY*zoom}px ${e.shadowBlur*zoom}px ${e.shadowColor}`:"none"}}>{e.uppercase?e.text.toUpperCase():e.text}</div>:null}
            {e.kind==="shape"?<div className="h-full w-full" style={e.shape==="circle"?{borderRadius:"50%",background:e.fill,border:`${e.strokeWidth*zoom}px solid ${e.stroke}`}:e.shape==="line"||e.shape==="arrow"?{height:Math.max(2,e.strokeWidth*zoom),background:e.stroke,marginTop:(e.height*zoom)/2}:{clipPath:e.shape==="triangle"?"polygon(50% 0, 100% 100%, 0 100%)":undefined,borderRadius:e.shape==="badge"?"9999px":e.shape==="rounded"?24*zoom:0,background:e.fill,border:`${e.strokeWidth*zoom}px solid ${e.stroke}`}}/>:null}
            {selectedIds.includes(e.id)&&!e.locked?<><button aria-label="Resize" onPointerDown={ev=>beginPointer(ev,e.id,"resize")} className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-white bg-blue-500"/><button aria-label="Rotate" onPointerDown={ev=>beginPointer(ev,e.id,"rotate")} className="absolute -top-7 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-blue-500 text-white"><RotateCw className="h-3 w-3"/></button></>:null}
          </div>:null)}
        </div>
      </div><p className="mt-2 text-xs text-ink-3">{status} · Delete removes · Ctrl/Cmd+D duplicates · arrows nudge · Shift+arrows move 10px.</p>
    </Card>
    <Well className="p-4"><p className="text-sm font-medium">2A foundation</p><p className="mt-1 text-xs text-ink-3">Shift-click selects multiple objects. Group related callouts, move them together, then ungroup for individual editing. Rich arrows and badges support product-feature annotations.</p></Well>
  </PageShell>;
}
