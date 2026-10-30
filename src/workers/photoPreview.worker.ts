import {exactCropSourceRect} from "../core/crop.ts";
import {previewRasterDimensions} from "../core/imageRaster.ts";
import {hasGeometryTransform,needsPixelProcessing,rotationCoverScale,setCanvasPhotoFilter} from "../core/photoAdjustments.ts";
import {processPhotoPixels} from "../core/photoPixels.ts";
import type {PreviewWorkerJob,PreviewWorkerReply} from "../core/photoPreviewRenderer.ts";

let cached:{url:string;bitmap:ImageBitmap}|null=null;
async function sourceBitmap(url:string):Promise<ImageBitmap>{
 if(cached?.url===url)return cached.bitmap;
 const response=await fetch(url,{credentials:"omit"});
 if(!response.ok)throw new Error("Local image source could not be decoded.");
 const next=await createImageBitmap(await response.blob());
 cached?.bitmap.close();cached={url,bitmap:next};
 return next;
}
async function render(message:PreviewWorkerJob):Promise<Blob>{
 const {asset,adjustments,mode,quality}=message;
 const image=await sourceBitmap(asset.processedUrl??asset.url);
 const base=mode==="crop"?previewRasterDimensions(asset.widthMm,asset.heightMm):
  {width:Math.max(1,Math.round(image.width*Math.min(1,1200/Math.max(image.width,image.height)))),
   height:Math.max(1,Math.round(image.height*Math.min(1,1200/Math.max(image.width,image.height))))};
 const scale=quality==="interactive"?Math.min(1,680/Math.max(base.width,base.height)):1;
 const width=Math.max(1,Math.round(base.width*scale));
 const height=Math.max(1,Math.round(base.height*scale));
 const canvas=new OffscreenCanvas(width,height);
 try{
  const context=canvas.getContext("2d");
  if(!context)throw new Error("OffscreenCanvas unavailable.");
  context.imageSmoothingQuality="high";
  const source=mode==="full"?{sx:0,sy:0,sw:image.width,sh:image.height}:
   exactCropSourceRect(image.width,image.height,asset.crop,asset.widthMm,asset.heightMm);
  context.clearRect(0,0,width,height);
  setCanvasPhotoFilter(context,adjustments);
  if(hasGeometryTransform(adjustments)){
   const angle=((adjustments.rotation??0)+(adjustments.straighten??0))*Math.PI/180;
   const cover=rotationCoverScale(width,height,angle*180/Math.PI);
   context.save();context.translate(width/2,height/2);context.rotate(angle);
   context.scale((adjustments.flipX?-1:1)*cover,(adjustments.flipY?-1:1)*cover);
   context.drawImage(image,source.sx,source.sy,source.sw,source.sh,-width/2,-height/2,width,height);
   context.restore();
  }else context.drawImage(image,source.sx,source.sy,source.sw,source.sh,0,0,width,height);
  if(needsPixelProcessing(adjustments)){
   const frame=context.getImageData(0,0,width,height);
   const whole=mode==="full"?{...adjustments,regions:[]}:adjustments;
   frame.data.set(processPhotoPixels(frame.data,width,height,whole));
   context.putImageData(frame,0,0);
  }
  return await canvas.convertToBlob({type:"image/png"});
 }finally{canvas.width=0;canvas.height=0;}
}
const scope=self as unknown as {
 onmessage:((event:MessageEvent<PreviewWorkerJob>)=>void)|null;
 postMessage:(reply:PreviewWorkerReply)=>void;
};
scope.onmessage=event=>{
 const job=event.data;
 void render(job).then(blob=>scope.postMessage({id:job.id,ok:true,blob}),
  error=>scope.postMessage({id:job.id,ok:false,
   error:error instanceof Error?error.message:"Worker preview failed."}));
};
