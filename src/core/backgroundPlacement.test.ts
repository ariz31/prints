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
