import test from "node:test";
import assert from "node:assert/strict";
import {
  clearIncomingInfographicAssets,
  getIncomingInfographicAssets,
  removeIncomingInfographicAsset,
  sendAssetToInfographicStudio,
} from "../lib/studio/internalAssetBridge.ts";

function memoryStorage(){
  const data=new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
}

test("Image Project assets hand off to Infographic Studio and dedupe",()=>{
  global.window={localStorage:memoryStorage()};
  clearIncomingInfographicAssets();
  const asset={id:"g1",url:"https://example.com/stretch.png",prompt:"fabric stretch",createdAt:"now"};
  sendAssetToInfographicStudio(asset);
  sendAssetToInfographicStudio(asset);
  assert.equal(getIncomingInfographicAssets().length,1);
  assert.equal(getIncomingInfographicAssets()[0].url,asset.url);
  removeIncomingInfographicAsset("g1");
  assert.equal(getIncomingInfographicAssets().length,0);
  delete global.window;
});
