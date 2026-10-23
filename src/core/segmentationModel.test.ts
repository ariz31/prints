import assert from "node:assert/strict";
import test from "node:test";
import {applyPersonMask} from "./segmentationModel.ts";
test("AI mask upsample preserves foreground, removes background, and keeps RGB",()=>{
 const original=new Uint8ClampedArray(4*4*4).fill(0);
 for(let i=0;i<original.length;i+=4){original[i]=128;original[i+1]=90;original[i+2]=40;original[i+3]=255;}
 const mask={width:2,height:2,data:new Float32Array([0,0,1,1])};
 const out=applyPersonMask(original,4,4,mask);
 assert.equal(out[3],0);
 assert.equal(out[(3*4+2)*4+3],255);
 assert.equal(out[0],128);
 assert.equal(original[3],255);
});
test("invalid masks, zero values and NaN fail before editing",()=>{
 const original=new Uint8ClampedArray(16);
 assert.throws(()=>applyPersonMask(original,0,4,{width:1,height:1,data:new Float32Array([1])}),/Invalid/);
 assert.throws(()=>applyPersonMask(original,2,2,{width:1,height:1,data:new Float32Array([Number.NaN])}),/Invalid AI/);
 assert.throws(()=>applyPersonMask(original,2,2,{width:1,height:1,data:new Float32Array([1])},0),/Invalid/);
});
