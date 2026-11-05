import assert from "node:assert/strict";
import test from "node:test";
import {createStoredZip,createStoredZipFromBlobs,crc32} from "./zip.ts";
test("ZIP32 emits valid local and central headers and checksummed bytes",async()=>{
 const data=new Uint8Array([1,2,3,4]);
 const blob=createStoredZip([{name:"01-photo.png",data}]);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const v=new DataView(bytes.buffer);
 assert.equal(v.getUint32(0,true),0x04034b50);
 assert.equal(v.getUint32(14,true),crc32(data));
 assert.equal(v.getUint32(18,true),4);
 assert.equal(bytes[30+"01-photo.png".length],1);
 const centralOffset=30+"01-photo.png".length+data.length;
 assert.equal(v.getUint32(centralOffset,true),0x02014b50);
 assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);
 assert.equal(v.getUint16(bytes.length-12,true),1);
 assert.equal(v.getUint32(bytes.length-6,true),centralOffset);
});
test("ZIP rejects path traversal, same-name collisions and memory overflow",()=>{
 const e={name:"x.png",data:new Uint8Array([1,2])};
 assert.throws(()=>createStoredZip([e,e]),/Unsafe or duplicated/);
 assert.throws(()=>createStoredZip([{...e,name:"../photo.png"}]),/Unsafe/);
 assert.throws(()=>createStoredZip([e],12),/96 MiB/);
 assert.throws(()=>createStoredZip([]),/1 to 25/);
});

test("Blob archive is byte-identical to legacy ZIP32 without reading entire input",async()=>{
 class GuardedBlob extends Blob{
  override async arrayBuffer():Promise<ArrayBuffer>{
   throw new Error("Input must not be read into one large ArrayBuffer.");
  }
 }
 const data=new Uint8Array(2048).map((_,i)=>i%251);
 const name="01-café.png";
 const expected=createStoredZip([{name,data}]);
 const actual=await createStoredZipFromBlobs([{name,data:new GuardedBlob([data],{type:"image/png"})}]);
 assert.deepEqual(new Uint8Array(await actual.arrayBuffer()),
  new Uint8Array(await expected.arrayBuffer()));
});
test("Blob ZIP rejects oversized batches before reading any file data",async()=>{
 class GuardedBlob extends Blob{
  override slice():Blob{throw new Error("No input should be read before the limit check.");}
 }
 const oversized=new GuardedBlob([new Uint8Array(100)]);
 await assert.rejects(createStoredZipFromBlobs([{name:"large.png",data:oversized}],100),
  /96 MiB ZIP limit/);
});
test("Blob ZIP cancellation preserves source and stops before reading the next chunk",async()=>{
 const canceled=new AbortController();
 class CancellingBlob extends Blob{
  override slice(start?:number,end?:number,contentType?:string):Blob{
   canceled.abort();
   return super.slice(start,end,contentType);
  }
 }
 await assert.rejects(createStoredZipFromBlobs([
  {name:"large.png",data:new CancellingBlob([new Uint8Array(1024*1024)])},
 ],undefined,canceled.signal),/canceled/);
 assert.equal(canceled.signal.aborted,true);
});
