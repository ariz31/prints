import {useEffect,useRef,useState} from "react";
import type {PhotoAsset} from "../../../core/exportPdf.ts";
import {rasterizeCropPreview} from "../../../core/imageRaster.ts";
import {DEFAULT_ADJUSTMENTS} from "../../../core/photoAdjustments.ts";
import {PhotoPreviewRenderer} from "../../../core/photoPreviewRenderer.ts";
import {activeCropRasterUrl,cropPreviewKey} from "../../../core/previewCache.ts";

/** Keep the exact, decoded raster as the Apply gate, while the editor shows a
 * continuously updated source/CSS crop during local worker rendering.
 * Latest-only rendering avoids queuing every slider and pointer event. */
export function useCropRaster(asset:PhotoAsset,enabled=true,retry=0){
 const key=cropPreviewKey(asset)+":"+retry;
 const [preview,setPreview]=useState<{key:string;url:string}|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 const [decoded,setDecoded]=useState("");
 const renderer=useRef<PhotoPreviewRenderer|null>(null);
 useEffect(()=>{
  const instance=new PhotoPreviewRenderer();
  renderer.current=instance;
  return()=>{instance.dispose();if(renderer.current===instance)renderer.current=null;};
 },[]);
 useEffect(()=>{
  if(!enabled)return;
  let canceled=false,timedOut=false;
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  // Interactive geometry is painted from the source immediately. Do not
  // spend main-thread time rasterizing intermediate pointer positions.
  const timer=setTimeout(()=>{
   watchdog=setTimeout(()=>{
    if(canceled)return;
    timedOut=true;
    setFailure({key,message:"Crop preview timed out. The source photo remains visible; retry the preview."});
   },12_000);
   const job=renderer.current?.render(asset,asset.adjustments??DEFAULT_ADJUSTMENTS,"crop","final")
    ??rasterizeCropPreview(asset);
   void job.then(blob=>{
    if(canceled||timedOut)return;
    setFailure(null);
    setPreview({key,url:URL.createObjectURL(blob)});
   }).catch(error=>{
    if(!canceled&&!timedOut)
     setFailure({key,message:error instanceof Error?error.message:"Preview unavailable."});
   }).finally(()=>clearTimeout(watchdog));
  },90);
  return()=>{canceled=true;clearTimeout(timer);clearTimeout(watchdog);};
 },[key,enabled]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 const url=activeCropRasterUrl(key,preview,failure,enabled);
 const ready=!!url&&decoded===url;
 return {url,ready,error:failure?.key===key?failure.message:"",
  loaded:(url:string)=>setDecoded(url),
  failed:()=>{setDecoded("");setFailure({key,message:"The computed crop preview could not be decoded. Retry the preview."});}};
}
