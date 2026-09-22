import test from "node:test";
import assert from "node:assert/strict";
import { clampZoom, duplicateElement, moveElement, reorderElement, resizeElement, rotateElement, snapValue } from "../lib/infographic/editor.ts";

const element = {
  id:"shape-1",name:"Box",kind:"shape",shape:"rectangle",x:100,y:200,width:300,height:200,
  rotation:0,opacity:1,visible:true,locked:false,fill:"#fff",stroke:"#000",strokeWidth:2,
};

test("moves and resizes editable elements",()=>{
  assert.deepEqual([moveElement(element,20,-10).x,moveElement(element,20,-10).y],[120,190]);
  assert.deepEqual([resizeElement(element,10,5).width,resizeElement(element,10,5).height],[20,20]);
});

test("locked elements ignore geometry mutations",()=>{
  const locked={...element,locked:true};
  assert.equal(moveElement(locked,50,50),locked);
  assert.equal(resizeElement(locked,500,500),locked);
});

test("rotation normalizes and duplicate receives new identity",()=>{
  assert.equal(rotateElement(element,-45).rotation,315);
  const copy=duplicateElement(element);
  assert.notEqual(copy.id,element.id);
  assert.equal(copy.x,130);
  assert.match(copy.name,/copy$/);
});

test("layer reorder and editor helpers are bounded",()=>{
  const b={...element,id:"b"},c={...element,id:"c"};
  assert.deepEqual(reorderElement([element,b,c],"b","forward").map(x=>x.id),["shape-1","c","b"]);
  assert.equal(clampZoom(.05),.2);
  assert.equal(clampZoom(3),2);
  assert.equal(snapValue(117,10,true),120);
  assert.equal(snapValue(117,10,false),117);
});
