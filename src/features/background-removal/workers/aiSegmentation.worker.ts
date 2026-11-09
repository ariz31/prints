import {segmentPersonLocally,segmentObjectLocally} from "../logic/segmentationModel.ts";
import type {ForegroundMask} from "../logic/segmentationModel.ts";
type Request={id:number;mode:"person"|"object";image:ImageData;point?:{x:number;y:number}};
type Response={id:number;type:"progress";step:string}|{id:number;type:"result";mask:ForegroundMask}|
 {id:number;type:"error";error:string};
const scope=self as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;
 postMessage:(message:Response,transfer?:Transferable[])=>void};
scope.onmessage=e=>{
 const job=e.data;if(!job||!Number.isSafeInteger(job.id))return;
 const controller=new AbortController();
 const progress=(step:string)=>scope.postMessage({id:job.id,type:"progress",step});
 void (async()=>{
  try{
    const mask=job.mode==="person"
      ?await segmentPersonLocally(job.image,controller.signal,progress)
      :await segmentObjectLocally(job.image,controller.signal,job.point??{x:.5,y:.5},progress);
    scope.postMessage({id:job.id,type:"result",mask},[mask.data.buffer]);
  }catch(error){
    scope.postMessage({id:job.id,type:"error",error:error instanceof Error?error.message:"AI unavailable."});
  }
 })();
};
