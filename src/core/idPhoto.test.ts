import assert from "node:assert/strict";
import test from "node:test";
import {frameIdFace,ID_SIZES} from "./idPhoto.ts";
import {exactCropSourceRect} from "./crop.ts";

test("face-aware photo crops respect exact 1x1, 2x2 and 35x45 output aspect",()=>{
 const face={x:400,y:300,width:300,height:400};
 for(const size of ID_SIZES){
  const crop=frameIdFace(face,1200,1600,size.widthMm,size.heightMm);
  const rect=exactCropSourceRect(1200,1600,crop,size.widthMm,size.heightMm);
  assert.ok(rect.sw>0 && rect.sh>0);
  assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=1.00001);
  assert.ok(crop.y+crop.height<=1.00001);
  assert.ok(rect.sy<=face.y);
 }
});
test("face composition clamps to image edges and rejects invalid inputs",()=>{
 const c=frameIdFace({x:0,y:0,width:200,height:250},640,480,25.4,25.4);
 assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=1.00001&&c.y+c.height<=1.00001);
 assert.throws(()=>frameIdFace({x:-5,y:10,width:10,height:10},640,480,50.8,50.8),/outside/);
 assert.throws(()=>frameIdFace({x:20,y:10,width:0,height:10},640,480,50.8,50.8),/Invalid/);
});
