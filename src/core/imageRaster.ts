import { exactCropSourceRect } from "./crop.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import { MM_PER_INCH } from "./layout.ts";
import { setCanvasPhotoFilter,needsPixelProcessing,hasGeometryTransform,rotationCoverScale } from "./photoAdjustments.ts";
import type {PhotoAdjustments} from "./photoAdjustments.ts";
import {processPhotoPixels} from "./photoPixels.ts";

/**
 * Estimate output pixels after bounded device-raster allocation.
 * The same function is used for rendering and PDF export budgets.
 */
export function rasterDimensions(widthMm:number,heightMm:number,dpi:number) {
  if(![widthMm,heightMm,dpi].every(v=>Number.isFinite(v)&&v>0))throw new Error("Invalid raster dimensions.");
  const requestedWidth=Math.max(1,Math.ceil(widthMm/MM_PER_INCH*dpi));
  const requestedHeight=Math.max(1,Math.ceil(heightMm/MM_PER_INCH*dpi));
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
 const context=canvas.getContext("2d");
 if(!context)throw new Error("Canvas rendering is not available on this device.");
 const source=full
  ?{sx:0,sy:0,sw:image.naturalWidth,sh:image.naturalHeight}
  :exactCropSourceRect(image.naturalWidth,image.naturalHeight,
    asset.crop,asset.widthMm,asset.heightMm);
 context.clearRect(0,0,width,height);
 context.imageSmoothingQuality="high";
 setCanvasPhotoFilter(context,adjustments);
 if(hasGeometryTransform(adjustments)){
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
 return new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):
    reject(new Error("Unable to encode this photo.")),"image/png");
 });
}
export async function rasterizeCrop(asset:PhotoAsset,dpi:number):Promise<Blob>{
 const {width,height}=rasterDimensions(asset.widthMm,asset.heightMm,dpi);
 return rasterizePhoto(asset,width,height);
}
/** Preview runs the SAME pipeline as export; only its pixel resolution differs. */
export async function rasterizePhotoPreview(
 asset:PhotoAsset,adjustments:PhotoAdjustments,mode:"full"|"crop",
):Promise<Blob>{
 if(mode==="crop")return rasterizeCrop({...asset,adjustments},120);
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
