import {useEffect,useState} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {rasterizeCropPreview} from "../core/imageRaster.ts";
import {activeCropRasterUrl,cropPreviewKey} from "../core/previewCache.ts";

/** Fence stale rasters and release each preview URL when replaced or unmounted. */
export function useCropRaster(asset:PhotoAsset,enabled=true,retry=0){
 const key=cropPreviewKey(asset)+":"+retry;
 const [preview,setPreview]=useState<{key:string;url:string}|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 const [decoded,setDecoded]=useState("");
 useEffect(()=>{
  if(!enabled)return;
  let canceled=false;
  const timer=setTimeout(()=>{
   void rasterizeCropPreview(asset).then(blob=>{
    if(canceled)return;
    setFailure(null);setPreview({key,url:URL.createObjectURL(blob)});
   }).catch(error=>{if(!canceled)setFailure({key,message:error instanceof Error?error.message:"Preview unavailable."});});
  },60);
  return()=>{canceled=true;clearTimeout(timer);};
 },[key,enabled]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 const url=activeCropRasterUrl(key,preview,failure,enabled);
 const ready=!!url&&decoded===url;
 return {url,ready,error:failure?.key===key?failure.message:"",
  loaded:(url:string)=>setDecoded(url),
  failed:()=>{setDecoded("");setFailure({key,message:"The computed crop preview could not be decoded. Retry the photo."});}};
}
