import type {PhotoAsset} from "./exportPdf.ts";
import type {PhotoAdjustments} from "./photoAdjustments.ts";
import {rasterizePhotoPreview} from "./imageRaster.ts";

export type PreviewSource=Pick<PhotoAsset,
 "url"|"processedUrl"|"crop"|"widthMm"|"heightMm"|"pixelWidth"|"pixelHeight"|"processedWidth"|"processedHeight">;
export interface PreviewWorkerJob{
 id:number;asset:PreviewSource;adjustments:PhotoAdjustments;
 mode:"full"|"crop";quality:"interactive"|"final";
}
export type PreviewWorkerReply=
 |{id:number;ok:true;blob:Blob}
 |{id:number;ok:false;error:string};
interface Pending{
 id:number;asset:PhotoAsset;adjustments:PhotoAdjustments;mode:"full"|"crop";
 quality:"interactive"|"final";
 resolve:(blob:Blob)=>void;reject:(cause:Error)=>void;
}
function sourceForWorker(asset:PhotoAsset):PreviewSource{
 const {url,processedUrl,crop,widthMm,heightMm,pixelWidth,pixelHeight,processedWidth,processedHeight}=asset;
 return {url,processedUrl,crop,widthMm,heightMm,pixelWidth,pixelHeight,processedWidth,processedHeight};
}
/** Off-main-thread latest-only render queue; no hosted image processing. */
export class PhotoPreviewRenderer{
 private worker:Worker|null=null;
 private active:Pending|null=null;
 private pending:Pending|null=null;
 private nextId=0;
 private disposed=false;
 constructor(){
  if(typeof Worker==="undefined"||typeof OffscreenCanvas==="undefined"||
     typeof createImageBitmap==="undefined")return;
  try{
   const worker=new Worker(new URL("../workers/photoPreview.worker.ts",import.meta.url),{type:"module"});
   worker.onmessage=(event:MessageEvent<PreviewWorkerReply>)=>this.onMessage(event.data);
   worker.onerror=event=>{event.preventDefault();this.disableWorker();};
   this.worker=worker;
  }catch{ /* Use the exact main-thread renderer on unsupported browsers. */ }
 }
 get usesWorker():boolean{return this.worker!==null;}
 render(asset:PhotoAsset,adjustments:PhotoAdjustments,mode:"full"|"crop",
  quality:"interactive"|"final"="final"):Promise<Blob>{
  if(this.disposed)return Promise.reject(new Error("Preview renderer disposed."));
  return new Promise<Blob>((resolve,reject)=>{
   const job:Pending={id:++this.nextId,asset,adjustments,mode,quality,resolve,reject};
   this.pending?.reject(new Error("Preview superseded."));
   this.pending=job;this.pump();
  });
 }
 private pump():void{
  if(this.disposed||this.active||!this.pending)return;
  const job=this.pending;this.pending=null;this.active=job;
  if(!this.worker){this.fallback(job);return;}
  try{
   const message:PreviewWorkerJob={id:job.id,asset:sourceForWorker(job.asset),
    adjustments:job.adjustments,mode:job.mode,quality:job.quality};
   this.worker.postMessage(message);
  }catch{this.disableWorker();}
 }
 private fallback(job:Pending):void{
  void rasterizePhotoPreview(job.asset,job.adjustments,job.mode).then(
   blob=>this.finish(job,blob),error=>this.fail(job,error));
 }
 private finish(job:Pending,blob:Blob):void{
  if(this.active?.id!==job.id)return;
  this.active=null;job.resolve(blob);this.pump();
 }
 private fail(job:Pending,cause:unknown):void{
  if(this.active?.id!==job.id)return;
  this.active=null;job.reject(cause instanceof Error?cause:new Error("Preview failed."));
  this.pump();
 }
 private onMessage(reply:PreviewWorkerReply):void{
  if(!this.active||reply.id!==this.active.id)return;
  if(reply.ok){this.finish(this.active,reply.blob);return;}
  this.disableWorker();
 }
 private disableWorker():void{
  if(!this.worker)return;
  this.worker.terminate();this.worker=null;
  if(this.active)this.fallback(this.active);else this.pump();
 }
 dispose():void{
  this.disposed=true;this.worker?.terminate();this.worker=null;
  this.active?.reject(new Error("Preview canceled."));
  this.pending?.reject(new Error("Preview canceled."));
  this.active=null;this.pending=null;
 }
}
