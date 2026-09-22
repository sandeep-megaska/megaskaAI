import test from "node:test";
import assert from "node:assert/strict";
import { duplicateElements, expandSelectionToGroups, groupElements, moveElements, ungroupElements } from "../lib/infographic/editor.ts";

const base=(id,x=0)=>({id,name:id,kind:"shape",shape:"rectangle",x,y:0,width:100,height:100,rotation:0,opacity:1,visible:true,locked:false,fill:"#fff",stroke:"#000",strokeWidth:1});
const elements=[base("a"),base("b",150),base("c",300)];

test("groups and expands selection to grouped peers",()=>{
  const grouped=groupElements(elements,["a","b"],"group-1");
  assert.deepEqual(expandSelectionToGroups(grouped,["a"]).sort(),["a","b"]);
  const ungrouped=ungroupElements(grouped,["a"]);
  assert.equal(ungrouped[0].groupId,undefined);
  assert.equal(ungrouped[1].groupId,undefined);
});

test("moves and duplicates multiple selected objects",()=>{
  const moved=moveElements(elements,["a","b"],20,30);
  assert.equal(moved[0].x,20);
  assert.equal(moved[1].x,170);
  assert.equal(moved[2].x,300);
  const duplicated=duplicateElements(elements,["a","b"]);
  assert.equal(duplicated.elements.length,5);
  assert.equal(duplicated.ids.length,2);
});
