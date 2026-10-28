import type {PhotoAsset} from "./exportPdf.ts";
import {exactCropSourceRect} from "./crop.ts";
import {MM_PER_INCH} from "./layout.ts";
import {setCanvasPhotoFilter,needsPixelProcessing,hasGeometryTransform,rotationCoverScale} from "./photoAdjustments.ts";
import {processPhotoPixels} from "./photoPixels.ts";

export const MAX_EXPORT_PIXELS=160_000_000;
export function requestedRasterDimensions(widthMm:number,heightMm:number,dpi:number){
 if(![widthMm,heightMm,dpi].every(Number.isFinite)||widthMm<=0||heightMm<=0||
   dpi<72||dpi>600)throw new Error("Invalid high-resolution dimensions.");
 const width=Math.max(1,Math.ceil(widthMm/MM_PER_INCH*dpi));
 const height=Math.max(1,Math.ceil(heightMm/MM_PER_INCH*dpi));
 if(!Number.isSafeInteger(width*height)||width*height>MAX_EXPORT_PIXELS||
   width>16000||height>16000)
  throw new Error("Requested raster exceeds the safe high-resolution output budget. Use fewer or smaller print designs.");
 return {width,height};
}
async function loadImage(url:string):Promise<HTMLImageElement>{
 return new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve(image);
  image.onerror=()=>reject(new Error("Unable to decode this source photo."));
  image.src=url;
 });
}
async function asPng(canvas:HTMLCanvasElement):Promise<Blob>{
 return new Promise((resolve,reject)=>canvas.toBlob(
  b=>b?resolve(b):reject(new Error("High-resolution PNG tile encoding failed.")),"image/png"));
}
/** Spot-heal clone samples a second source ring to the right; reserve the same
 * global-coordinate pixels for each tile so tiled output matches a full frame.
 * All scratch allocations remain explicitly bounded.
 */
export function tileScratchBounds(totalWidth:number,totalHeight:number,
 x:number,y:number,w:number,h:number,healRadius=0){
 if(![totalWidth,totalHeight,x,y,w,h].every(Number.isSafeInteger)||
    totalWidth<1||totalHeight<1||x<0||y<0||w<1||h<1||
    x+w>totalWidth||y+h>totalHeight||
    !Number.isFinite(healRadius)||healRadius<0)
  throw new Error("Invalid high-resolution tile bounds.");
 const padRight=Math.max(3,Math.ceil(2*healRadius+4));
 const left=Math.max(0,x-3),top=Math.max(0,y-3);
 const right=Math.min(totalWidth,x+w+padRight);
 const bottom=Math.min(totalHeight,y+h+3);
 if((right-left)*(bottom-top)>3_000_000)
  throw new Error("Spot-heal radius exceeds safe high-resolution tile memory. Reduce brush radius or export at 300 DPI.");
 return {left,top,right,bottom};
}
export function isHighResHealSafe(width:number,height:number,healRadius:number,chunk=768):boolean{
 if(![width,height,chunk].every(Number.isSafeInteger)||width<1||height<1||chunk<1||
    !Number.isFinite(healRadius)||healRadius<0)return false;
 const pad=Math.max(3,Math.ceil(2*healRadius+4));
 const worstWidth=Math.min(width,Math.min(chunk,width)+3+pad);
 const worstHeight=Math.min(height,Math.min(chunk,height)+6);
 return worstWidth*worstHeight<=3_000_000;
}
export interface HighResolutionRaster {
 width:number;height:number;
 dispose:()=>void;
 render:(x:number,y:number,width:number,height:number)=>HTMLCanvasElement;
 png:(x:number,y:number,width:number,height:number)=>Promise<Blob>;
}
/**
 * Bounded crop-rendering canvas, preserving original source and full-frame
 * transform coordinates. Three-pixel overlap protects 3x3 filters and
 * bilinear boundaries from tile seams. The temporary canvas stays small.
 */
export async function createHighResolutionRaster(asset:PhotoAsset,dpi:number):Promise<HighResolutionRaster>{
 const {width,height}=requestedRasterDimensions(asset.widthMm,asset.heightMm,dpi);
 const adjustments=asset.adjustments;
 const healRadius=Math.max(0,...(adjustments?.regions??[])
   .filter(region=>region.kind==="heal")
   .map(region=>region.radius*Math.min(width,height)));
 if(healRadius&&!isHighResHealSafe(width,height,healRadius))
  throw new Error("Spot-heal radius exceeds safe high-resolution tile memory. Reduce brush radius or export at 300 DPI.");
 const image=await loadImage(asset.processedUrl??asset.url);
 const source=exactCropSourceRect(image.naturalWidth,image.naturalHeight,
  asset.crop,asset.widthMm,asset.heightMm);
 let disposed=false;
 const render=(x:number,y:number,w:number,h:number):HTMLCanvasElement=>{
  if(disposed)throw new Error("This raster has been released.");
  if(![x,y,w,h].every(Number.isSafeInteger)||x<0||y<0||w<=0||h<=0||
    x+w>width||y+h>height||w*h>3_000_000)
   throw new Error("Invalid high-resolution tile bounds.");
  const {left:rx,top:ry,right,bottom}=tileScratchBounds(
    width,height,x,y,w,h,healRadius);
  const scratch=document.createElement("canvas");
  scratch.width=right-rx;scratch.height=bottom-ry;
  try{
  const ctx=scratch.getContext("2d",{willReadFrequently:needsPixelProcessing(adjustments)});
  if(!ctx)throw new Error("The browser cannot render high-resolution photo tiles.");
  ctx.imageSmoothingQuality="high";
  ctx.save();ctx.translate(-rx,-ry);
  setCanvasPhotoFilter(ctx,adjustments);
  if(hasGeometryTransform(adjustments)){
   const angle=((adjustments?.rotation??0)+(adjustments?.straighten??0))*Math.PI/180;
   const cover=rotationCoverScale(width,height,angle*180/Math.PI);
   ctx.translate(width/2,height/2);ctx.rotate(angle);
   ctx.scale((adjustments?.flipX?-1:1)*cover,(adjustments?.flipY?-1:1)*cover);
   ctx.drawImage(image,source.sx,source.sy,source.sw,source.sh,
    -width/2,-height/2,width,height);
  }else ctx.drawImage(image,source.sx,source.sy,source.sw,source.sh,0,0,width,height);
  ctx.restore();
  if(needsPixelProcessing(adjustments)){
   const frame=ctx.getImageData(0,0,scratch.width,scratch.height);
   const pixels=processPhotoPixels(frame.data,scratch.width,scratch.height,adjustments,
    {x:rx,y:ry,totalWidth:width,totalHeight:height});
   frame.data.set(pixels);ctx.putImageData(frame,0,0);
  }
  const tile=document.createElement("canvas");
  tile.width=w;tile.height=h;
  try{
  const tctx=tile.getContext("2d",{willReadFrequently:true});
  if(!tctx)throw new Error("Unable to create output image tile.");
  tctx.drawImage(scratch,x-rx,y-ry,w,h,0,0,w,h);
  return tile;
  }catch(error){tile.width=0;tile.height=0;throw error;}
  }finally{scratch.width=0;scratch.height=0;}
 };
 return {width,height,render,dispose:()=>{disposed=true;image.src="";},png:async(x,y,w,h)=>{
  const canvas=render(x,y,w,h);
  try{return await asPng(canvas);}
  finally{canvas.width=0;canvas.height=0;}
 }};
}
