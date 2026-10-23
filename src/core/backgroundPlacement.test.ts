import assert from "node:assert/strict";
import test from "node:test";
import {backgroundImageRect,backgroundPositionPercent} from "./backgroundPlacement.ts";
test("image cover uses exact crop math and edge-limited offsets",()=>{
 assert.deepEqual(backgroundImageRect(400,200,100,100),{x:-50,y:0,width:200,height:100});
 assert.deepEqual(backgroundImageRect(400,200,100,100,"cover",-1,0),
  {x:0,y:0,width:200,height:100});
 assert.deepEqual(backgroundImageRect(400,200,100,100,"cover",1,0),
  {x:-100,y:0,width:200,height:100});
});
test("contain fits image without cropping, and values cannot introduce unsafe output",()=>{
 assert.deepEqual(backgroundImageRect(400,200,100,100,"contain"),
  {x:0,y:25,width:100,height:50});
 assert.throws(()=>backgroundImageRect(0,200,100,100),/Invalid/);
 assert.throws(()=>backgroundImageRect(400,200,100,100,"cover",2),/Invalid/);
 assert.throws(()=>backgroundImageRect(400,200,100,100,"stretch" as never),/Invalid/);
});

test("cover and contain output rectangles match CSS background-position for all offsets",()=>{
 for(const fit of ["cover","contain"] as const){
  for(const offsetX of [-1,-.6,0,.4,1])for(const offsetY of [-1,-.5,0,.3,1]){
   for(const [iw,ih,cw,ch] of [[600,200,100,180],[100,500,160,110],[480,320,800,200]]){
    const rect=backgroundImageRect(iw,ih,cw,ch,fit,offsetX,offsetY);
    const px=backgroundPositionPercent(offsetX)/100,py=backgroundPositionPercent(offsetY)/100;
    assert.ok(Math.abs(rect.x-(cw-rect.width)*px)<1e-7);
    assert.ok(Math.abs(rect.y-(ch-rect.height)*py)<1e-7);
   }
  }
 }
 assert.throws(()=>backgroundPositionPercent(NaN),/Invalid/);
 assert.throws(()=>backgroundPositionPercent(-1.01),/Invalid/);
});
