import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeConcepts } from "../lib/infographic/creativeDirector.ts";

test("creative director produces three editable marketplace concepts",()=>{
  const concepts=buildCreativeConcepts({productName:"AquaFlex Suit",productType:"women's swimsuit",audience:"lap swimmers",features:["chlorine resistant","four-way stretch","full coverage"],tone:"performance"});
  assert.equal(concepts.length,3);
  assert.deepEqual(concepts.map(c=>c.name),["Feature Hero","Detail Proof","Benefit Story"]);
  assert.ok(concepts.every(c=>c.document.width===2000&&c.document.height===2000));
  assert.ok(concepts.every(c=>c.document.elements.length>0));
});

test("generation prompts preserve product identity and omit rendered text",()=>{
  const [concept]=buildCreativeConcepts({productName:"Zip Suit",productType:"swimsuit",audience:"swimmers",features:["front zipper"],tone:"technical"});
  assert.match(concept.imagePrompt,/Preserve the exact garment\/product design/i);
  assert.match(concept.imagePrompt,/no added text/i);
  assert.match(concept.headline,/ENGINEERED FOR PERFORMANCE/);
});

test("brief falls back safely when optional copy is sparse",()=>{
  const concepts=buildCreativeConcepts({productName:"",productType:"sports top",audience:"",features:[],tone:"minimal"});
  assert.match(concepts[0].support,/sports top/i);
  assert.equal(concepts[0].featureLabels.length,3);
});
