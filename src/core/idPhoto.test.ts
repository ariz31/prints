import assert from "node:assert/strict";
import test from "node:test";
import {frameIdFace,ID_SIZES,customIdSize,canEditIdFraming} from "./idPhoto.ts";
import {exactCropSourceRect,panCrop,zoomCrop} from "./crop.ts";
import {gestureCrop} from "./cropGesture.ts";

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

test("ID crop changes are blocked while comparing, analyzing or loading",()=>{
 for(const ready of [false,true])for(const compare of [false,true])for(const busy of [false,true]){
  assert.equal(canEditIdFraming(ready,compare,busy),ready&&!compare&&!busy);
 }
});

test("continuous ID framing preserves exact output geometry after pinch and pan",()=>{
 const image={width:1200,height:1600};
 for(const format of ID_SIZES){
  const initial=frameIdFace({x:400,y:320,width:300,height:380},
   image.width,image.height,format.widthMm,format.heightMm);
  const bounds={left:10,top:20,width:300,height:400};
  const pinch=gestureCrop(initial,[{x:110,y:120},{x:210,y:220}],
   [{x:100,y:110},{x:220,y:230}],bounds);
  const panned=gestureCrop(pinch,[{x:150,y:190}],
   [{x:155,y:200}],bounds);
  const rect=exactCropSourceRect(image.width,image.height,panned,
   format.widthMm,format.heightMm);
  assert.ok(rect.sw>0&&rect.sh>0);
  assert.ok(panned.x>=0&&panned.y>=0&&panned.x+panned.width<=1.000001);
  assert.ok(panned.y+panned.height<=1.000001);
 }
});
test("ID framing is reversible by applying one final normalized crop",()=>{
 const base={x:.12,y:.14,width:.6,height:.6};
 const afterPan=panCrop(base,.07,-.05);
 const final=zoomCrop(afterPan,1.2,.4,.6);
 assert.ok(final.width<base.width);
 assert.deepEqual(base,{x:.12,y:.14,width:.6,height:.6});
 exactCropSourceRect(800,800,final,50.8,50.8);
});
