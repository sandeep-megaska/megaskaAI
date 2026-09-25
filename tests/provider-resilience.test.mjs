import test from "node:test";
import assert from "node:assert/strict";
import { classifyProviderExhaustion } from "../lib/ai/providerResilience.ts";

test("classifies quota evidence",()=>assert.equal(classifyProviderExhaustion({status:429,message:"RESOURCE_EXHAUSTED quota RPM exceeded"}),"quota"));
test("classifies shared capacity evidence",()=>assert.equal(classifyProviderExhaustion({status:429,message:"Resource exhausted due to shared capacity; try again later"}),"capacity"));
test("keeps ambiguous 429 unknown",()=>assert.equal(classifyProviderExhaustion({status:429,message:"RESOURCE_EXHAUSTED"}),"unknown"));
test("ignores ordinary client errors",()=>assert.equal(classifyProviderExhaustion({status:400,message:"invalid argument"}),null));
