import type { EditorDocument, EditorShapeElement, EditorTextElement } from "./editor";
import { createId } from "./editor";
import { MEGASKA_BRAND_KIT } from "./templates";

export type CreativeBrief = {
  productName: string;
  productType: string;
  audience: string;
  features: string[];
  tone: "performance" | "premium" | "minimal" | "technical";
};

export type CreativeConcept = {
  id: string;
  name: string;
  purpose: string;
  headline: string;
  support: string;
  featureLabels: string[];
  imagePrompt: string;
  document: EditorDocument;
};

function text(name:string,x:number,y:number,width:number,height:number,value:string,size:number,weight=800,color="#111111"):EditorTextElement{
  return {id:createId("text"),name,kind:"text",x,y,width,height,rotation:0,opacity:1,visible:true,locked:false,text:value,fontFamily:MEGASKA_BRAND_KIT.headingFont,fontSize:size,fontWeight:weight,color,align:"left",italic:false,uppercase:false,lineHeight:1.05,letterSpacing:0,backgroundColor:"transparent",shadowColor:"#000000",shadowBlur:0,shadowX:0,shadowY:0};
}
function shape(name:string,x:number,y:number,width:number,height:number,fill:string,kind:EditorShapeElement["shape"]="rounded"):EditorShapeElement{
  return {id:createId("shape"),name,kind:"shape",shape:kind,x,y,width,height,rotation:0,opacity:1,visible:true,locked:false,fill,stroke:fill,strokeWidth:0};
}
function clean(value:string){return value.trim().replace(/\s+/g," ");}
function labels(brief:CreativeBrief){return brief.features.map(clean).filter(Boolean).slice(0,3);}

export function buildCreativeConcepts(brief:CreativeBrief):CreativeConcept[]{
  const product=clean(brief.productName)||clean(brief.productType)||"PRODUCT";
  const features=labels(brief);
  const first=features[0]||"Designed for comfort";
  const second=features[1]||"Made to move";
  const third=features[2]||"Built for everyday performance";
  const audience=clean(brief.audience)||"modern active customers";
  const tone=brief.tone;
  const tonePhrase=tone==="technical"?"ENGINEERED FOR PERFORMANCE":tone==="premium"?"PREMIUM BY DESIGN":tone==="minimal"?"ESSENTIAL. REFINED.":"MADE TO MOVE";

  return [
    {
      id:"feature-hero",name:"Feature Hero",purpose:"Lead secondary image with one clear product promise.",headline:tonePhrase,support:`${product} · ${first}`,featureLabels:[first,second,third],
      imagePrompt:`Create a clean premium e-commerce product hero image of ${product} for ${audience}. Preserve the exact garment/product design, construction, colors and branding from the supplied reference. Emphasize ${first}. Studio lighting, uncluttered composition, no added text, no invented logos, suitable as the visual layer of a marketplace feature infographic.`,
      document:{width:2000,height:2000,background:"#ffffff",elements:[shape("Accent",120,120,180,26,"#f3f516"),text("Brand",120,170,650,90,"MEGASKA",52),text("Headline",120,330,1450,260,tonePhrase,128),text("Support",120,620,950,150,`${product}\n${first}`,48,600),shape("Hero image placeholder",1080,620,780,1120,"#f3f4f6"),text("Image placeholder label",1170,1090,600,120,"ADD / GENERATE\nPRODUCT VISUAL",42,800)]}
    },
    {
      id:"detail-proof",name:"Detail Proof",purpose:"Explain one construction or material detail with a close-up visual.",headline:first.toUpperCase(),support:`Show the detail. Explain the benefit.`,featureLabels:[first,second],
      imagePrompt:`Create a macro product-detail image for ${product}, focusing specifically on ${first}. Preserve exact material, stitching, hardware, colors and construction from the supplied reference. Photorealistic commercial product photography, crisp detail, controlled studio light, no text, no extra design elements.`,
      document:{width:2000,height:2000,background:"#f3f4f6",elements:[text("Brand",120,110,600,90,"MEGASKA",50),text("Headline",120,260,1500,220,first.toUpperCase(),112),shape("Detail image placeholder",1050,590,820,1120,"#ffffff"),text("Detail placeholder label",1150,1080,620,120,"DETAIL IMAGE",46),shape("Feature badge",120,720,690,150,"#f3f516"),text("Feature label",170,760,590,90,first.toUpperCase(),46),text("Support",120,940,720,200,`Built around ${first.toLowerCase()} for ${audience}.`,44,500)]}
    },
    {
      id:"benefit-story",name:"Benefit Story",purpose:"Turn product specifications into three scannable customer benefits.",headline:"WHY YOU'LL LOVE IT",support:`${product} benefits at a glance.`,featureLabels:[first,second,third],
      imagePrompt:`Create a premium lifestyle-supporting product image of ${product} for ${audience}. Preserve exact product identity and color. Communicate ${first}, ${second}, and ${third} through pose/composition rather than text. Marketplace-safe commercial photography, simple background, no added text or logos.`,
      document:{width:2000,height:2000,background:"#ffffff",elements:[text("Brand",120,110,600,90,"MEGASKA",50),text("Headline",120,270,1500,210,"WHY YOU'LL LOVE IT",112),shape("Benefit 1",120,720,520,650,"#f3f4f6"),shape("Benefit 2",740,720,520,650,"#f3f4f6"),shape("Benefit 3",1360,720,520,650,"#f3f4f6"),text("Benefit 1 text",170,810,420,230,first.toUpperCase(),54),text("Benefit 2 text",790,810,420,230,second.toUpperCase(),54),text("Benefit 3 text",1410,810,420,230,third.toUpperCase(),54)]}
    }
  ];
}
