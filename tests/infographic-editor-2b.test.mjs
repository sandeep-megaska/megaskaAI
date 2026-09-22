import test from "node:test";
import assert from "node:assert/strict";
import { alignmentGuides, clampCropOffset, clampCropZoom } from "../lib/infographic/editor.ts";

const element={id:"x",name:"x",kind:"shape",shape:"rectangle",x:750,y:900,width:500,height:200,rotation:0,opacity:1,visible:true,locked:false,fill:"#fff",stroke:"#000",strokeWidth:1};
const doc={width:2000,height:2000,background:"#fff",elements:[element]};

test("crop controls stay inside editor bounds",()=>{
  assert.equal(clampCropOffset(-140),-100);
  assert.equal(clampCropOffset(125),100);
  assert.equal(clampCropZoom(.5),1);
  assert.equal(clampCropZoom(8),4);
});

test("alignment guides detect canvas centers",()=>{
  const guides=alignmentGuides(element,doc);
  assert.ok(guides.some(g=>g.axis==="x"&&g.value===1000));
  assert.ok(guides.some(g=>g.axis==="y"&&g.value===1000));
});
