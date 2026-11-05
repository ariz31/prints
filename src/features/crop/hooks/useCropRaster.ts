import {useEffect,useRef,useState} from "react";
import type {RefObject} from "react";
import type {PhotoAsset} from "../../../core/exportPdf.ts";
import {adaptiveCropPreviewDimensions,previewRasterDimensions,rasterizeCropPreview} from "../../../core/imageRaster.ts";
import type {CropPreviewSize} from "../../../core/imageRaster.ts";
import {DEFAULT_ADJUSTMENTS} from "../../../core/photoAdjustments.ts";
import {PhotoPreviewRenderer} from "../../../core/photoPreviewRenderer.ts";
import {activeCropRasterUrl,sizedCropPreviewKey} from "../../../core/previewCache.ts";

interface DisplaySize {width:number;height:number;dpr:number}
/** Source pixels render immediately while an exact, device-aware raster is
 * generated in the client worker. The exact decoded result still gates Apply.
 * An optional stage ref enables high-DPI sizing without requiring React
 * updates on every drag/pinch frame. */
export function useCropRaster(
 asset:PhotoAsset,enabled=true,retry=0,stageRef?:RefObject<HTMLDivElement|null>,
){
 const [viewport,setViewport]=useState<DisplaySize|null>(null);
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
  const element=stageRef?.current;
  if(!element||typeof window==="undefined")return;
  const measure=()=>{
   const rect=element.getBoundingClientRect();
   if(rect.width<=0||rect.height<=0)return;
   const next={width:rect.width,height:rect.height,dpr:window.devicePixelRatio||1};
   setViewport(previous=>previous&&Math.abs(previous.width-next.width)<1&&
     Math.abs(previous.height-next.height)<1&&previous.dpr===next.dpr?previous:next);
  };
  measure();
  const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(measure);
  observer?.observe(element);
  window.addEventListener("resize",measure);
  window.visualViewport?.addEventListener("resize",measure);
  return()=>{
   observer?.disconnect();
   window.removeEventListener("resize",measure);
   window.visualViewport?.removeEventListener("resize",measure);
  };
 },[stageRef]);
 const size:CropPreviewSize|null=viewport
  ?adaptiveCropPreviewDimensions(
    asset.widthMm,asset.heightMm,viewport.width,viewport.height,viewport.dpr,
    asset.processedWidth??asset.pixelWidth,asset.processedHeight??asset.pixelHeight,
    asset.crop.width,asset.crop.height)
  :stageRef?null:previewRasterDimensions(asset.widthMm,asset.heightMm);
 const key=size?sizedCropPreviewKey(asset,size,retry):"pending-layout";
 useEffect(()=>{
  if(!enabled||!size)return;
  let canceled=false,timedOut=false;
  const controller=new AbortController();
  let watchdog:ReturnType<typeof setTimeout>|undefined;
  const timer=setTimeout(()=>{
   watchdog=setTimeout(()=>{
    if(canceled)return;
    timedOut=true;controller.abort();
    setFailure({key,message:"Crop preview timed out. The source photo remains visible; retry the preview."});
   },12_000);
   // Abort the previous request when geometry or needed resolution changes.
   const job=renderer.current?.render(asset,asset.adjustments??DEFAULT_ADJUSTMENTS,
     "crop","final",controller.signal,size)
      ??rasterizeCropPreview(asset,size);
   void job.then(blob=>{
    if(canceled||timedOut)return;
    setFailure(null);
    setPreview({key,url:URL.createObjectURL(blob)});
   }).catch(error=>{
    if(canceled||timedOut||controller.signal.aborted)return;
    setFailure({key,message:error instanceof Error?error.message:"Preview unavailable."});
   }).finally(()=>clearTimeout(watchdog));
  },90);
  return()=>{
   canceled=true;controller.abort();
   clearTimeout(timer);clearTimeout(watchdog);
  };
 // Resolution, crop geometry and source are embedded in the stable key.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,enabled]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 const url=activeCropRasterUrl(key,preview,failure,enabled&&!!size);
 const ready=!!url&&decoded===url;
 return {url,ready,error:failure?.key===key?failure.message:"",
  loaded:(value:string)=>setDecoded(value),
  failed:()=>{
   setDecoded("");
   setFailure({key,message:"The computed crop preview could not be decoded. Retry the preview."});
  }};
}
