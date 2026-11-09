import assert from "node:assert/strict";
import test from "node:test";
import {snapBrushToEdge} from "./edgeSnap.ts";
const make=(width:number,height:number)=>({
  mask:new Uint8Array(width*height).fill(255),
  pixels:new Uint8ClampedArray(width*height*4).fill(255),
});
test("smart brush finds strong source RGB contours even with an opaque AI mask",()=>{
  const width=14,height=14,{mask,pixels}=make(width,height);
  for(let y=0;y<height;y++)for(let x=7;x<width;x++){
    const i=(y*width+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=0;
  }
  const original={x:4/13,y:7/13};
  const point=snapBrushToEdge(original,mask,pixels,width,height,true);
  assert.ok(point.x>original.x);
  assert.ok(Math.abs(point.x*13-6)<=1,"snapped to the visible boundary");
});
test("smart brush preserves pointer position for images with no visible contours",()=>{
 const {mask,pixels}=make(12,12),point={x:.35,y:.45};
 assert.deepEqual(snapBrushToEdge(point,mask,pixels,12,12,true),point);
});
test("disabling snapping never changes user coordinates",()=>{
 const {mask,pixels}=make(8,8),point={x:.55,y:.4};
 mask[3*8+4]=0;
 assert.equal(snapBrushToEdge(point,mask,pixels,8,8,false),point);
});
