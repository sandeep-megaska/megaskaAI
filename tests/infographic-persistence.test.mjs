import test from "node:test";
import assert from "node:assert/strict";
import { cloneDocument, saveCreative, saveTemplate, upsertAsset } from "../lib/infographic/persistence.ts";

const doc={width:2000,height:2000,background:"#fff",elements:[]};

test("saved creative updates by id instead of duplicating",()=>{
  const first=saveCreative([],"Look 1",doc,"p1");
  const second=saveCreative(first,"Look 1 revised",{...doc,background:"#000"},"p1");
  assert.equal(second.length,1);
  assert.equal(second[0].name,"Look 1 revised");
  assert.equal(second[0].document.background,"#000");
});

test("saved documents are cloned from editor state",()=>{
  const copy=cloneDocument(doc);
  copy.background="#123456";
  assert.equal(doc.background,"#fff");
});

test("custom templates retain editable document structure",()=>{
  const templates=saveTemplate([],"Feature master",doc);
  assert.equal(templates[0].name,"Feature master");
  assert.equal(templates[0].document.width,2000);
  assert.match(templates[0].id,/^custom-/);
});

test("asset library upserts stable asset ids",()=>{
  const a={id:"a",name:"front.png",src:"data:image/png;base64,x",createdAt:"now"};
  const next=upsertAsset([a],{...a,name:"front-new.png"});
  assert.equal(next.length,1);
  assert.equal(next[0].name,"front-new.png");
});
