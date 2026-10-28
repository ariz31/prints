import assert from "node:assert/strict";
import test from "node:test";
import {encodeRgbaPng,tagPngDensity} from "./pngStream.ts";
test("streamed encoder creates a valid RGBA PNG header and signature",async()=>{
 const out=await encodeRgbaPng(2,2,(_y,rows)=>new Uint8Array(2*rows*4).fill(255));
 assert.equal(out.type,"image/png");
 const bytes=new Uint8Array(await out.arrayBuffer());
 assert.deepEqual(Array.from(bytes.slice(0,8)),[137,80,78,71,13,10,26,10]);
 const view=new DataView(bytes.buffer);
 assert.equal(view.getUint32(16,false),2);
 assert.equal(view.getUint32(20,false),2);
 assert.ok(out.size>40);
});
test("streamed encoder rejects invalid stripe input and zero dimensions",async()=>{
 await assert.rejects(encodeRgbaPng(0,1,()=>new Uint8Array()),/Invalid/);
 await assert.rejects(encodeRgbaPng(3,1,()=>new Uint8Array(2)),/Invalid RGBA/);
});

test("both streaming and tagged PNGs preserve physical DPI with exactly one pHYs chunk",async()=>{
 const initial=await encodeRgbaPng(3,2,(_y,rows)=>new Uint8Array(3*rows*4),600);
 const adjusted=await tagPngDensity(initial,300);
 const bytes=new Uint8Array(await adjusted.arrayBuffer());
 const view=new DataView(bytes.buffer);
 const names:string[]=[];
 let offset=8;
 for(;;){
  const length=view.getUint32(offset,false);
  const name=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
  names.push(name);
  if(name==="pHYs"){
   assert.equal(view.getUint32(offset+8,false),Math.round(300*1000/25.4));
   assert.equal(bytes[offset+16],1);
  }
  offset+=12+length;
  if(name==="IEND")break;
  assert.ok(offset<bytes.length);
 }
 assert.equal(names.filter(n=>n==="pHYs").length,1);
});

test("canceling a streamed PNG stops stripe work and reports monotonic progress",async()=>{
 const controller=new AbortController(),progress:number[]=[];
 let stripes=0;
 await assert.rejects(encodeRgbaPng(10,200,(_y,rows)=>{
  stripes++;return new Uint8Array(10*rows*4);
 },300,{signal:controller.signal,onProgress:(done)=>{progress.push(done);if(done>0)controller.abort();}}),/canceled/);
 assert.equal(stripes,1);assert.deepEqual(progress,[0,64]);
 await assert.rejects(encodeRgbaPng(10,10,()=>{throw new Error("must not render");},300,{signal:controller.signal}),/canceled/);
});
