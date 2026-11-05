import assert from "node:assert/strict";
import test from "node:test";
import {brushDirtyRect} from "./brushDirtyRect.ts";

test("brush repaint only covers affected pixels along the segment",()=>{
 const r=brushDirtyRect({x:400,y:500},{x:420,y:520},18,1600,1200);
 assert.deepEqual(r,{x:380,y:480,width:61,height:61});
 assert.ok(r.width*r.height<1600*1200/100);
});
test("brush repaint clamps to canvas bounds on edges",()=>{
 assert.deepEqual(brushDirtyRect({x:0,y:0},{x:1,y:1},18,100,80),
  {x:0,y:0,width:22,height:22});
});
