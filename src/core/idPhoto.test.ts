import assert from "node:assert/strict";
import test from "node:test";
import {frameIdFace,ID_SIZES,customIdSize} from "./idPhoto.ts";
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

test("custom ID dimensions are exact millimeters and safely bounded",()=>{
 assert.deepEqual(customIdSize("31.75","41.5"),{
  id:"id-custom",label:"Custom 31.75 × 41.5 mm",widthMm:31.75,heightMm:41.5,
 });
 for(const [w,h] of [["","45"],["0","45"],["NaN","40"],["20","Infinity"],
  ["-1","45"],["201","45"],["25","0"],["1e2","50"],["25.1234","40"]]){
  assert.equal(customIdSize(w,h),null,w+" x "+h);
 }
 const size=customIdSize("30","40")!;
 const crop=frameIdFace({x:150,y:100,width:200,height:250},600,800,
   size.widthMm,size.heightMm);
 const rect=exactCropSourceRect(600,800,crop,size.widthMm,size.heightMm);
 assert.ok(Math.abs(rect.sw/rect.sh-.75)<.005);
});
