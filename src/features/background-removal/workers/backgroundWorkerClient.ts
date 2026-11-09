import type {BackgroundRecipe} from "../logic/backgroundRecipe.ts";
import type {RGB} from "../logic/background.ts";
import type {BackgroundWorkerReply,BackgroundWorkerRequest} from "./backgroundWorker.ts";

type RequestBody =
  | {type:"mask";recipe:BackgroundRecipe;width:number;height:number}
  | {type:"export";recipe:BackgroundRecipe;source:Blob}
  | {type:"color";source:Uint8ClampedArray;width:number;height:number;sample:RGB;tolerance:number};
function runJob(job:RequestBody,signal?:AbortSignal,onProgress?:(done:number,total:number)=>void):Promise<BackgroundWorkerReply>{
 return new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(new DOMException("Canceled","AbortError"));return;}
   if(typeof Worker==="undefined"){reject(new Error("This browser does not support background processing workers."));return;}
   const worker=new Worker(new URL("./backgroundWorker.ts",import.meta.url),{type:"module"});
   let finished=false;
   const finish=()=>{if(finished)return false;finished=true;worker.terminate();
     signal?.removeEventListener("abort",abort);return true;};
   const abort=()=>{if(finish())reject(new DOMException("Canceled","AbortError"));};
   signal?.addEventListener("abort",abort,{once:true});
   worker.onerror=e=>{if(finish())reject(new Error(e.message||"Background worker failed."));};
   worker.onmessage=e=>{
     const reply=e.data as BackgroundWorkerReply;
     if(!reply||reply.id!==1)return;
     if(reply.type==="progress"){onProgress?.(reply.done,reply.total);return;}
     if(!finish())return;
     if(!reply.ok)reject(new Error(reply.error));
     else resolve(reply);
   };
   worker.postMessage({...job,id:1} as BackgroundWorkerRequest);
 });
}
/** Coalesce rapid slider updates before spawning a new worker.
 * The mask worker does not need large embedded replacement image data. */
export async function previewMask(recipe:BackgroundRecipe,w:number,h:number,signal?:AbortSignal){
 if(signal?.aborted)throw new DOMException("Canceled","AbortError");
 await new Promise<void>((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);
      reject(new DOMException("Canceled","AbortError"));};
   const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},24);
   signal?.addEventListener("abort",abort,{once:true});
   if(signal?.aborted)abort();
 });
 const stripped:BackgroundRecipe={...recipe,backdrop:{kind:"transparent"}};
 const result=await runJob({type:"mask",recipe:stripped,width:w,height:h},signal);
 if(result.ok&&result.type==="mask")return result.alpha;
 throw new Error("Mask worker did not return an alpha mask.");
}
export async function renderBackgroundFullResolution(originalUrl:string,recipe:BackgroundRecipe,
 signal?:AbortSignal,onProgress?:(completed:number,total:number)=>void){
 const response=await fetch(originalUrl,{signal});
 if(!response.ok)throw new Error("Original photo is unavailable for full-resolution processing.");
 const source=await response.blob();
 const result=await runJob({type:"export",source,recipe},signal,onProgress);
 if(result.ok&&result.type==="export")return result;
 throw new Error("Background worker did not return an image.");
}

/** Local color-key cleanup runs independently of foreground painting and UI input. */
export async function removeColorInWorker(source:Uint8ClampedArray,width:number,height:number,
 sample:RGB,tolerance:number,signal?:AbortSignal){
 const result=await runJob({type:"color",source:new Uint8ClampedArray(source),
   width,height,sample,tolerance},signal);
 if(result.ok&&result.type==="color")return {alpha:result.alpha,removed:result.removed};
 throw new Error("Color worker did not return a mask.");
}
