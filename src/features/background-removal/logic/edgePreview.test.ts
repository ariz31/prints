import assert from "node:assert/strict";
import test from "node:test";
import {isMaskEdge} from "./edgePreview.ts";

test("edge-only view outlines hard binary backgrounds, not just soft alpha",()=>{
  const w=7,h=7,mask=new Uint8Array(w*h);
  for(let y=2;y<=4;y++)for(let x=2;x<=4;x++)mask[y*w+x]=255;
  assert.equal(isMaskEdge(mask,w,h,2,3),true,"inside hard silhouette is visible");
  assert.equal(isMaskEdge(mask,w,h,1,3),true,"outside adjacent outline is visible");
  assert.equal(isMaskEdge(mask,w,h,3,3),false,"opaque center is hidden");
  assert.equal(isMaskEdge(mask,w,h,0,0),false,"transparent background is hidden");
});
test("edge-only view highlights partial hair and transparent glass edges",()=>{
 const mask=new Uint8Array(25);
 mask[2*5+2]=160;
 assert.equal(isMaskEdge(mask,5,5,2,2),true);
 assert.equal(isMaskEdge(mask,5,5,0,0),false);
 assert.equal(isMaskEdge(mask,5,5,-1,2),false);
});
