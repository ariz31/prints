import assert from "node:assert/strict";
import test from "node:test";
import {exportBatchPngZip} from "./batchExport.ts";
import type {PhotoAsset} from "./exportPdf.ts";
const item:PhotoAsset={id:"first",name:"portrait.jpg",url:"blob:unused",
 pixelWidth:500,pixelHeight:500,widthMm:50.8,heightMm:50.8,quantity:3,
 crop:{x:0,y:0,width:1,height:1},focalX:50,focalY:50};
const renderer=async()=>new Blob([new Uint8Array([137,80,78,71])],{type:"image/png"});
test("batch PNG conversion exports independent numbered designs sequentially",async()=>{
 const assets=[item,{...item,id:"second",name:"portrait.jpg"}];
 const progress:number[]=[];
 const zip=await exportBatchPngZip(assets,{onProgress:n=>progress.push(n)},renderer);
 assert.deepEqual(progress,[0,1,2]);
 const bytes=new Uint8Array(await zip.arrayBuffer());
 assert.equal(new DataView(bytes.buffer).getUint16(bytes.length-12,true),2);
 assert.ok(bytes.length>100);
});
test("cancel and memory cap prevent unbounded batch generation",async()=>{
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(exportBatchPngZip([item],{signal:aborted.signal},renderer),/canceled/);
 await assert.rejects(exportBatchPngZip([item],{maxBytes:10},renderer),/96 MiB/);
});

test("early ZIP memory budget stops processing before rendering all images",async()=>{
 let renders=0;
 const mock=async()=>{renders++;return new Blob([new Uint8Array(30)],{type:"image/png"});};
 await assert.rejects(exportBatchPngZip([item,{...item,id:"b"}],
   {maxBytes:110},mock),/96 MiB ZIP limit/);
 assert.equal(renders,1);
});

test("batch ZIP handles large provider-backed PNG blobs without whole-source reads",async()=>{
 class NoWholeReadBlob extends Blob{
  override async arrayBuffer():Promise<ArrayBuffer>{
   throw new Error("Batch export must not load a full PNG blob into JS memory.");
  }
 }
 const fake=new NoWholeReadBlob([new Uint8Array(256*1024)],{type:"image/png"});
 const result=await exportBatchPngZip([item],{},async()=>fake);
 assert.ok(result.size>fake.size);
 const bytes=new Uint8Array(await result.arrayBuffer());
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 assert.equal(new DataView(bytes.buffer).getUint32(bytes.byteLength-22,true),0x06054b50);
});
