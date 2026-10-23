import assert from "node:assert/strict";
import test from "node:test";
import {encodeRgbaPng} from "./pngStream.ts";
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
