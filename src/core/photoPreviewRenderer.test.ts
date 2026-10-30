import assert from "node:assert/strict";
import {test} from "node:test";
import {PhotoPreviewRenderer} from "./photoPreviewRenderer.ts";
import {DEFAULT_ADJUSTMENTS} from "./photoAdjustments.ts";
import type {PhotoAsset} from "./exportPdf.ts";
import type {PreviewWorkerJob,PreviewWorkerReply} from "./photoPreviewRenderer.ts";

class FakeWorker {
 static last:FakeWorker;
 onmessage:((event:MessageEvent<PreviewWorkerReply>)=>void)|null=null;
 onerror:((event:Event)=>void)|null=null;
 readonly posted:PreviewWorkerJob[]=[];
 terminated=false;
 constructor(){FakeWorker.last=this;}
 postMessage(message:PreviewWorkerJob){this.posted.push(message);}
 terminate(){this.terminated=true;}
 finish(id:number){
  this.onmessage?.({data:{id,ok:true,blob:new Blob(["local"])}}
   as MessageEvent<PreviewWorkerReply>);
 }
}
function mock(name:string,value:unknown){
 const original=Object.getOwnPropertyDescriptor(globalThis,name);
 Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 return ()=>{
  if(original)Object.defineProperty(globalThis,name,original);
  else Reflect.deleteProperty(globalThis,name);
 };
}
const asset={url:"blob:local-photo",pixelWidth:100,pixelHeight:100,
 widthMm:25.4,heightMm:25.4,crop:{x:0,y:0,width:1,height:1}} as PhotoAsset;

test("photo preview queue discards superseded work and preserves the latest",async()=>{
 const restoreWorker=mock("Worker",FakeWorker);
 const restoreCanvas=mock("OffscreenCanvas",class{});
 const restoreBitmap=mock("createImageBitmap",()=>{});
 let renderer:PhotoPreviewRenderer|undefined;
 try{
  renderer=new PhotoPreviewRenderer();
  assert.equal(renderer.usesWorker,true);
  const first=renderer.render(asset,DEFAULT_ADJUSTMENTS,"full","interactive");
  const superseded=renderer.render(asset,DEFAULT_ADJUSTMENTS,"full","interactive");
  const last=renderer.render(asset,DEFAULT_ADJUSTMENTS,"full","final");
  await assert.rejects(superseded,/superseded/);
  const fake=FakeWorker.last;
  assert.equal(fake.posted.length,1);
  assert.equal(fake.posted[0].asset.url,"blob:local-photo");
  fake.finish(fake.posted[0].id);
  await first;
  assert.equal(fake.posted.length,2);
  assert.equal(fake.posted[1].quality,"final");
  fake.finish(fake.posted[1].id);
  await last;
  renderer.dispose();
  assert.equal(fake.terminated,true);
  await assert.rejects(renderer.render(asset,DEFAULT_ADJUSTMENTS,"full"),/disposed/);
 }finally{
  renderer?.dispose();restoreBitmap();restoreCanvas();restoreWorker();
 }
});

test("disposing an editor cancels active and queued preview promises",async()=>{
 const restoreWorker=mock("Worker",FakeWorker);
 const restoreCanvas=mock("OffscreenCanvas",class{});
 const restoreBitmap=mock("createImageBitmap",()=>{});
 try{
  const renderer=new PhotoPreviewRenderer();
  const active=renderer.render(asset,DEFAULT_ADJUSTMENTS,"crop");
  const queued=renderer.render(asset,DEFAULT_ADJUSTMENTS,"crop");
  renderer.dispose();
  await assert.rejects(active,/canceled/);
  await assert.rejects(queued,/canceled/);
  assert.equal(FakeWorker.last.terminated,true);
 }finally{restoreBitmap();restoreCanvas();restoreWorker();}
});
