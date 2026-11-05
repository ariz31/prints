import assert from "node:assert/strict";
import test from "node:test";
import {parsePhotoAdjustmentNumber,resolvePhotoAdjustmentNumber} from "./photoAdjustmentNumber.ts";
import {PHOTO_CONTROLS} from "./photoAdjustments.ts";

test("inline numeric inputs accept exact integer values across all photo adjustment controls",()=>{
 for(const [key,bounds] of Object.entries(PHOTO_CONTROLS)){
  assert.equal(parsePhotoAdjustmentNumber(String(bounds.min),bounds.min,bounds.max),bounds.min,key+" min");
  assert.equal(parsePhotoAdjustmentNumber(String(bounds.max),bounds.min,bounds.max),bounds.max,key+" max");
  assert.equal(parsePhotoAdjustmentNumber(String(bounds.min-1),bounds.min,bounds.max),null,key+" low");
  assert.equal(parsePhotoAdjustmentNumber(String(bounds.max+1),bounds.min,bounds.max),null,key+" high");
  assert.equal(parsePhotoAdjustmentNumber("1.5",bounds.min,bounds.max),null,key+" fractional");
  assert.equal(parsePhotoAdjustmentNumber("",bounds.min,bounds.max),null,key+" empty");
  assert.equal(parsePhotoAdjustmentNumber("-",bounds.min,bounds.max),null,key+" intermediate");
 }
});
test("photo opacity edits accept 0-100 and do not silently reset invalid entries",()=>{
 for(const opacity of [0,1,35,100]){
  assert.equal(parsePhotoAdjustmentNumber(String(opacity),0,100),opacity);
 }
 for(const raw of ["","-","1.5","NaN","101","-1"]){
  assert.equal(resolvePhotoAdjustmentNumber(raw,45,0,100),45,raw);
 }
 assert.equal(resolvePhotoAdjustmentNumber("0",45,0,100),0);
 assert.equal(resolvePhotoAdjustmentNumber("100",45,0,100),100);
});
test("signed straighten and exposure values retain their signs and exact bounds",()=>{
 assert.equal(parsePhotoAdjustmentNumber("-15",-15,15),-15);
 assert.equal(parsePhotoAdjustmentNumber("-200",-200,200),-200);
 assert.equal(resolvePhotoAdjustmentNumber("-16",2,-15,15),2);
 assert.equal(parsePhotoAdjustmentNumber("200",-200,200),200);
});

test("all on-canvas slider settings retain explicit bounds and integer percentages",()=>{
 const values:[
  string,number,number,number
 ][]=[
  ["crop zoom",100,800,225],["background preview zoom",100,250,125],
  ["background tolerance",0,150,45],["brush radius",2,100,18],
  ["AI threshold",10,90,50],["AI softness",1,50,15],
  ["ID headroom",0,35,13],["layer opacity",0,100,63],
  ["background position",-100,100,-28],
 ];
 for(const [label,min,max,value] of values){
  assert.equal(parsePhotoAdjustmentNumber(String(value),min,max),value,label);
  assert.equal(parsePhotoAdjustmentNumber(String(min-1),min,max),null,label+" low");
  assert.equal(parsePhotoAdjustmentNumber(String(max+1),min,max),null,label+" high");
  assert.equal(resolvePhotoAdjustmentNumber("",value,min,max),value,label+" blank");
 }
});
