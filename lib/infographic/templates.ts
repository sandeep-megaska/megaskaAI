import type { EditorDocument, EditorShapeElement, EditorTextElement } from "./editor";

export type BrandKit = {
  name: string;
  colors: { name:string; value:string }[];
  headingFont: string;
  bodyFont: string;
};

export const MEGASKA_BRAND_KIT: BrandKit = {
  name:"MEGASKA",
  colors:[
    {name:"Ink",value:"#111111"},
    {name:"White",value:"#ffffff"},
    {name:"Electric Lime",value:"#f3f516"},
    {name:"Soft Grey",value:"#f3f4f6"},
  ],
  headingFont:"Arial, Helvetica, sans-serif",
  bodyFont:"Arial, Helvetica, sans-serif",
};

const text=(id:string,name:string,x:number,y:number,width:number,height:number,value:string,size:number,weight=800):EditorTextElement=>({
  id,name,kind:"text",x,y,width,height,rotation:0,opacity:1,visible:true,locked:false,text:value,fontFamily:MEGASKA_BRAND_KIT.headingFont,fontSize:size,fontWeight:weight,color:"#111111",align:"left",italic:false,uppercase:false,lineHeight:1.05,letterSpacing:0,backgroundColor:"transparent",shadowColor:"#000000",shadowBlur:0,shadowX:0,shadowY:0,
});
const shape=(id:string,name:string,x:number,y:number,width:number,height:number,fill:string):EditorShapeElement=>({
  id,name,kind:"shape",shape:"rounded",x,y,width,height,rotation:0,opacity:1,visible:true,locked:false,fill,stroke:fill,strokeWidth:0,
});

export type CreativeTemplate={id:string;name:string;description:string;document:EditorDocument};

export const CREATIVE_TEMPLATES:CreativeTemplate[]=[
 {id:"feature-focus",name:"Feature Focus",description:"Hero area with bold feature headline and supporting callout.",document:{width:2000,height:2000,background:"#ffffff",elements:[
   shape("accent","Accent",120,120,180,28,"#f3f516"),text("brand","Brand",120,175,600,100,"MEGASKA",54,800),text("title","Headline",120,330,1180,260,"DESIGNED TO MOVE",132,800),text("body","Support copy",120,620,780,190,"Highlight the product benefit with a short, clear explanation.",52,500),shape("callout","Callout",120,920,600,150,"#f3f516"),text("callout-text","Callout text",165,960,520,90,"FEATURE DETAIL",48,800)
 ]}},
 {id:"detail-story",name:"Detail Story",description:"Clean construction/detail composition for zipper, fabric or seam stories.",document:{width:2000,height:2000,background:"#f3f4f6",elements:[
   text("brand2","Brand",120,120,600,90,"MEGASKA",50,800),text("title2","Headline",120,270,1350,230,"BUILT IN THE DETAILS",118,800),shape("panel","Detail panel",1100,620,720,980,"#ffffff"),text("feature1","Feature one",120,760,760,150,"SMOOTH CLOSURE",64,800),text("copy1","Copy one",120,930,760,180,"Use a generated close-up image in the detail panel and explain the construction here.",42,500)
 ]}},
 {id:"benefit-grid",name:"Benefit Grid",description:"Three concise product benefits for marketplace secondary images.",document:{width:2000,height:2000,background:"#ffffff",elements:[
   text("brand3","Brand",120,110,600,90,"MEGASKA",50,800),text("title3","Headline",120,270,1500,210,"WHY YOU'LL LOVE IT",112,800),
   shape("b1","Benefit 1",120,720,520,650,"#f3f4f6"),shape("b2","Benefit 2",740,720,520,650,"#f3f4f6"),shape("b3","Benefit 3",1360,720,520,650,"#f3f4f6"),
   text("t1","Benefit 1 text",170,810,420,190,"COMFORT\nFIRST",62,800),text("t2","Benefit 2 text",790,810,420,190,"MADE TO\nMOVE",62,800),text("t3","Benefit 3 text",1410,810,420,190,"BUILT TO\nLAST",62,800)
 ]}},
];
