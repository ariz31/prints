import assert from "node:assert/strict";
import test from "node:test";
import { cornerCutLines,validateCornerMarkClearance } from "./cutMarks.ts";
test("eight true cut-mark segments stay outside trimmed design",()=>{
 const p={xMm:5,yMm:10,widthMm:50.8,heightMm:50.8};
 const m=cornerCutLines(p);
 assert.equal(m.length,8);
 for(const line of m){
   assert.ok([line.x1,line.x2,line.y1,line.y2].every(Number.isFinite));
   const midX=(line.x1+line.x2)/2,midY=(line.y1+line.y2)/2;
   assert.ok(!(midX>p.xMm&&midX<p.xMm+p.widthMm&&
     midY>p.yMm&&midY<p.yMm+p.heightMm));
 }
 assert.deepEqual(m[0],{x1:4.6,y1:10,x2:3.6,y2:10});
});
test("corner marks reject unsafe margins and gaps",()=>{
 assert.doesNotThrow(()=>validateCornerMarkClearance(5,3));
 assert.throws(()=>validateCornerMarkClearance(1,3),/Corner cut marks/);
 assert.throws(()=>validateCornerMarkClearance(5,1),/Corner cut marks/);
 assert.throws(()=>cornerCutLines({xMm:0,yMm:0,widthMm:0,heightMm:50}),/placement/);
});
