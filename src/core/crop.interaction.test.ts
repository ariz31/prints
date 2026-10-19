import assert from "node:assert/strict";
import test from "node:test";
import {fitCropToAspect,panCrop,zoomCrop,exactCropSourceRect,FULL_CROP} from "./crop.ts";
test("frame aspect follows physical print aspect and source pixel ratio",()=>{
  const c=fitCropToAspect(FULL_CROP,4000,2000,50.8,50.8);
  assert.deepEqual(c,{x:.25,y:0,width:.5,height:1});
  assert.deepEqual(exactCropSourceRect(4000,2000,c,50.8,50.8),{sx:1000,sy:0,sw:2000,sh:2000});
});
test("drag image right shifts selected source left with clamped bounds",()=>{
 const c=fitCropToAspect(FULL_CROP,4000,2000,50,50);
 const p=panCrop(c, .2,0);
 assert.ok(Math.abs(p.x-.15)<1e-9);
 assert.deepEqual(panCrop(c,100,0).x,0);
});
test("zoom retains selection aspect and clamps edges",()=>{
 const c=fitCropToAspect(FULL_CROP,4000,2000,50,50);
 const z=zoomCrop(c,2);
 assert.ok(Math.abs(z.width/.25-1)<1e-10);
 assert.ok(Math.abs(z.height/.5-1)<1e-10);
 assert.ok(Math.abs(z.x-.375)<1e-10);
 assert.throws(()=>zoomCrop(c,0),/Invalid/);
});
test("export must reject mismatched crop instead of silently applying cover",()=>{
 assert.throws(()=>exactCropSourceRect(4000,2000,FULL_CROP,50,50),/Crop and print shape differ/);
});
test("changing aspect explicitly fits existing visible selection",()=>{
 const c=fitCropToAspect({x:.1,y:.1,width:.7,height:.7},3000,2000,90,50);
 const rect=exactCropSourceRect(3000,2000,c,90,50);
 assert.ok(rect.sw/rect.sh>1.79 && rect.sw/rect.sh<1.81);
});
