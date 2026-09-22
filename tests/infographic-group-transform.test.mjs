import test from "node:test";
import assert from "node:assert/strict";
import { selectionBounds, transformElements } from "../lib/infographic/editor.ts";

const base=(id,x,y,w=100,h=100)=>({id,name:id,kind:"shape",shape:"rectangle",x,y,width:w,height:h,rotation:0,opacity:1,visible:true,locked:false,fill:"#fff",stroke:"#000",strokeWidth:1,groupId:"g"});
const elements=[base("a",0,0),base("b",200,100)];

test("selection bounds cover grouped elements",()=>{
  assert.deepEqual(selectionBounds(elements,["a","b"]),{x:0,y:0,width:300,height:200,centerX:150,centerY:100});
});

test("group move preserves relative geometry",()=>{
  const moved=transformElements(elements,["a","b"],elements,"move",50,20);
  assert.deepEqual(moved.map(e=>[e.x,e.y]),[[50,20],[250,120]]);
});

test("group resize scales positions and dimensions around selection bounds",()=>{
  const resized=transformElements(elements,["a","b"],elements,"resize",300,200);
  assert.equal(resized[0].width,200);
  assert.equal(resized[1].x,400);
  assert.equal(resized[1].y,200);
});

test("group rotation rotates centers and each element",()=>{
  const rotated=transformElements(elements,["a","b"],elements,"rotate",0,0,90);
  assert.equal(rotated[0].rotation,90);
  assert.equal(rotated[1].rotation,90);
  assert.ok(Math.abs(rotated[0].x-200)<.001);
  assert.ok(Math.abs(rotated[0].y+100)<.001);
});
