import {useEffect,useState} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {rasterizeCropPreview} from "../core/imageRaster.ts";
import {activeCropRasterUrl,cropPreviewKey} from "../core/previewCache.ts";

/** Keep the last decoded photo visible while a new exact crop is rendered.
 * Stale work is fenced; an unresponsive canvas gets a recoverable error. */
export function useCropRaster(asset:PhotoAsset,enabled=true,retry=0){
 const key=cropPreviewKey(asset)+":"+retry;
 const [preview,setPreview]=useState<{key:string;url:string}|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 const [decoded,setDecoded]=useState("");
 useEffect(()=>{
  if(!enabled)return;
  let canceled=false,timedOut=false;
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  const timer=setTimeout(()=>{
   watchdog=setTimeout(()=>{
    if(canceled)return;
    timedOut=true;
    setFailure({key,message:"Crop preview timed out. The original photo remains visible; retry the photo."});
   },12_000);
   void rasterizeCropPreview(asset).then(blob=>{
    if(canceled||timedOut)return;
    setFailure(null);
    setPreview({key,url:URL.createObjectURL(blob)});
   }).catch(error=>{
    if(!canceled&&!timedOut)
     setFailure({key,message:error instanceof Error?error.message:"Preview unavailable."});
   }).finally(()=>clearTimeout(watchdog));
  },140);
  return()=>{canceled=true;clearTimeout(timer);clearTimeout(watchdog);};
 },[key,enabled]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 const url=activeCropRasterUrl(key,preview,failure,enabled);
 const ready=!!url&&decoded===url;
 return {url,ready,error:failure?.key===key?failure.message:"",
  loaded:(url:string)=>setDecoded(url),
  failed:()=>{setDecoded("");setFailure({key,message:"The computed crop preview could not be decoded. Retry the photo."});}};
}
