import type {ForegroundMask} from "../logic/segmentationModel.ts";
export function segmentBackgroundInWorker(image:ImageData,mode:"person"|"object",
 point:{x:number;y:number},signal:AbortSignal,onProgress?:(step:string)=>void):Promise<ForegroundMask>{
 return new Promise((resolve,reject)=>{
   if(signal.aborted){reject(new DOMException("Canceled","AbortError"));return;}
   if(typeof Worker==="undefined"){reject(new Error("On-device AI requires worker support."));return;}
   const worker=new Worker(new URL("./aiSegmentation.worker.ts",import.meta.url),{type:"module"});
   let finished=false;
   function cleanup(){if(finished)return false;finished=true;worker.terminate();
     signal.removeEventListener("abort",cancel);return true;}
   function cancel(){if(cleanup())reject(new DOMException("Canceled","AbortError"));}
   signal.addEventListener("abort",cancel,{once:true});
   worker.onerror=e=>{if(cleanup())reject(new Error(e.message||"AI worker failed."));};
   worker.onmessage=e=>{
      const reply=e.data as {id:number;type:"result"|"error"|"progress";mask?:ForegroundMask;error?:string;step?:string};
      if(reply.id!==1||finished)return;
      if(reply.type==="progress"){onProgress?.(reply.step??"Processing…");return;}
      if(cleanup()){
        if(reply.type==="result"&&reply.mask)resolve(reply.mask);
        else reject(new Error(reply.error??"AI segmentation failed."));
      }
   };
   worker.postMessage({id:1,mode,image,point});
 });
}
