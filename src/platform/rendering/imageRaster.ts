import { exactCropSourceRect } from "../../core/crop.ts";
import {maskCropShape} from "../../core/cropShapes.ts";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import { MM_PER_INCH } from "../../domain/geometry/units.ts";
import { setCanvasPhotoFilter,needsPixelProcessing,hasGeometryTransform,rotationCoverScale,photoOpacityFraction } from "../../core/photoAdjustments.ts";
import type {PhotoAdjustments} from "../../core/photoAdjustments.ts";
import {processPhotoPixels} from "./photoPixels.ts";
import {drawStudioImage,drawStudioFrame,hasStudioTransform} from "../../features/crop/logic/studioCanvas.ts";
import {studioForOutput} from "../../features/crop/logic/studioDocument.ts";

/**
 * Estimate output pixels after bounded device-raster allocation.
 * The same function is used for rendering and PDF export budgets.
 */
export function rasterDimensions(widthMm:number,heightMm:number,dpi:number) {
  if(![widthMm,heightMm,dpi].every(v=>Number.isFinite(v)&&v>0))throw new Error("Invalid raster dimensions.");
  const requestedWidth=Math.max(1,Math.round(widthMm/MM_PER_INCH*dpi));
  const requestedHeight=Math.max(1,Math.round(heightMm/MM_PER_INCH*dpi));
  const scale=Math.min(1,3000/requestedWidth,3000/requestedHeight,
    Math.sqrt(9_000_000/(requestedWidth*requestedHeight)));
  return {width:Math.max(1,Math.round(requestedWidth*scale)),
    height:Math.max(1,Math.round(requestedHeight*scale))};
}

/** Actual raster quality after the bounded canvas allocation is applied. */
export function effectiveRasterDpi(widthMm:number,heightMm:number,targetDpi:number):number {
 const {width,height}=rasterDimensions(widthMm,heightMm,targetDpi);
 return Math.floor(Math.min(width/(widthMm/MM_PER_INCH),
   height/(heightMm/MM_PER_INCH)));
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode this image."));
    image.src = url;
  });
}

/**
 * Shared rasterization for previews and PDF embedding.
 * Source bytes stay unchanged. Avoid uncontrolled giant canvas allocations.
 */
/** Shared Canvas draw and pixel processing, used by both editor and all exports. */
async function rasterizePhoto(
 asset:PhotoAsset,width:number,height:number,full=false,
 adjustments:PhotoAdjustments|undefined=asset.adjustments,
):Promise<Blob>{
 const image=await decodeImage(asset.processedUrl??asset.url);
 const canvas=document.createElement("canvas");
 canvas.width=width;canvas.height=height;
 try {
 const context=canvas.getContext("2d");
 if(!context)throw new Error("Canvas rendering is not available on this device.");
 const studio=full?undefined:studioForOutput(asset.cropStudio,asset.crop,asset.widthMm,asset.heightMm);
 const source=full
  ?{sx:0,sy:0,sw:image.naturalWidth,sh:image.naturalHeight}
  :exactCropSourceRect(image.naturalWidth,image.naturalHeight,
    asset.crop,asset.widthMm,asset.heightMm);
 context.clearRect(0,0,width,height);
 context.imageSmoothingQuality="high";
 setCanvasPhotoFilter(context,adjustments);
 context.globalAlpha=photoOpacityFraction(adjustments);
 if(studio && hasStudioTransform(studio)){
   drawStudioImage(context,image,source,width,height,studio,adjustments);
 }else if(hasGeometryTransform(adjustments)){
  const angle=((adjustments?.rotation??0)+(adjustments?.straighten??0))*Math.PI/180;
  // Exact cover for a rotated rectangle: no unfilled corners or hidden second crop.
  const cover=rotationCoverScale(width,height,angle*180/Math.PI);
  context.save();
  context.translate(width/2,height/2);
  context.rotate(angle);
  context.scale((adjustments?.flipX?-1:1)*cover,(adjustments?.flipY?-1:1)*cover);
  context.drawImage(image,source.sx,source.sy,source.sw,source.sh,
    -width/2,-height/2,width,height);
  context.restore();
 }else{
  context.drawImage(image,source.sx,source.sy,source.sw,source.sh,0,0,width,height);
 }
 if(needsPixelProcessing(adjustments)){
  const frame=context.getImageData(0,0,width,height);
  const edited=processPhotoPixels(frame.data,width,height,adjustments);
  frame.data.set(edited);
  context.putImageData(frame,0,0);
 }
 if(!full){
   if(studio)drawStudioFrame(context,studio,width,height);
   maskCropShape(context,asset.cropShape,width,height,0,0,asset.cropPolygon);
 }
 return await new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(blob=>blob?resolve(blob):
     reject(new Error("Unable to encode this photo.")),"image/png");
  });
 } finally {
  canvas.width=0;canvas.height=0;
 }
}
/** Screen previews are bounded independently of full-resolution print exports.
 * Explicit targets are validated on both the UI and worker paths. */
export interface CropPreviewSize {width:number;height:number}
const PREVIEW_MAX_SIDE=2048;
const PREVIEW_MAX_PIXELS=3_000_000;
export function previewRasterDimensions(widthMm:number,heightMm:number,target?:CropPreviewSize):CropPreviewSize{
 if(![widthMm,heightMm].every(v=>Number.isFinite(v)&&v>0))
  throw new Error("Invalid preview dimensions.");
 if(target&&(!Number.isFinite(target.width)||!Number.isFinite(target.height)||
   target.width<=0||target.height<=0))
  throw new Error("Invalid preview target.");
 const initial=target??rasterDimensions(widthMm,heightMm,120);
 const maxSide=target?PREVIEW_MAX_SIDE:1400;
 const maxPixels=target?PREVIEW_MAX_PIXELS:1_600_000;
 const scale=Math.min(1,maxSide/Math.max(initial.width,initial.height),
  Math.sqrt(maxPixels)/Math.sqrt(initial.width)/Math.sqrt(initial.height));
 return {width:Math.max(1,Math.floor(initial.width*scale)),
  height:Math.max(1,Math.floor(initial.height*scale))};
}
/** A physically displayed crop needs device pixels, not a fixed print DPI.
 * Quantized targets avoid rerendering for one-pixel mobile chrome/viewport changes.
 * Source crop pixels cap wasted upscaling without pretending to invent detail. */
export function adaptiveCropPreviewDimensions(
 widthMm:number,heightMm:number,cssWidth:number,cssHeight:number,dpr:number,
 sourceWidth:number,sourceHeight:number,cropWidth=1,cropHeight=1,
):CropPreviewSize{
 const values=[widthMm,heightMm,cssWidth,cssHeight,dpr,sourceWidth,sourceHeight,cropWidth,cropHeight];
 if(!values.every(v=>Number.isFinite(v)&&v>0))
  throw new Error("Invalid adaptive preview dimensions.");
 const ratio=widthMm/heightMm;
 if(!Number.isFinite(ratio)||ratio<=0)throw new Error("Invalid adaptive aspect ratio.");
 const pixelsPerCss=Math.max(1,Math.min(4,dpr));
 const demandWidth=Math.max(cssWidth,cssHeight*ratio)*pixelsPerCss;
 const sourceLimit=Math.max(1,sourceWidth*Math.min(1,cropWidth));
 const sourceHeightLimit=Math.max(1,sourceHeight*Math.min(1,cropHeight))*ratio;
 if(![demandWidth,sourceLimit,sourceHeightLimit].every(Number.isFinite))
  throw new Error("Invalid adaptive preview dimensions.");
 // Snap upward to 64-pixel buckets so slight resizing can reuse a raster.
 const side=Math.min(Math.ceil(demandWidth/64)*64,sourceLimit,sourceHeightLimit);
 return previewRasterDimensions(widthMm,heightMm,{
  width:Math.max(1,Math.ceil(side)),
  height:Math.max(1,Math.ceil(side/ratio)),
 });
}
export async function rasterizeCropPreview(asset:PhotoAsset,target?:CropPreviewSize):Promise<Blob>{
 const {width,height}=previewRasterDimensions(asset.widthMm,asset.heightMm,target);
 return rasterizePhoto(asset,width,height);
}
export async function rasterizeCrop(asset:PhotoAsset,dpi:number):Promise<Blob>{
 const {width,height}=rasterDimensions(asset.widthMm,asset.heightMm,dpi);
 return rasterizePhoto(asset,width,height);
}
/** Preview runs the SAME pipeline as export; only its pixel resolution differs. */
export async function rasterizePhotoPreview(
 asset:PhotoAsset,adjustments:PhotoAdjustments,mode:"full"|"crop",
 target?:CropPreviewSize,
):Promise<Blob>{
 if(mode==="crop")return rasterizeCropPreview({...asset,adjustments},target);
 const w=asset.processedWidth??asset.pixelWidth,h=asset.processedHeight??asset.pixelHeight;
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)
  throw new Error("Invalid source image dimensions.");
 const scale=Math.min(1,1200/Math.max(w,h));
 // Crop-relative local retouches are intentionally displayed only in print-crop
 // mode. Never project a print-local coordinate onto the uncropped source.
 const whole={...adjustments,regions:[]};
 return rasterizePhoto(asset,Math.max(1,Math.round(w*scale)),
   Math.max(1,Math.round(h*scale)),true,whole);
}
