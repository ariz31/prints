import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeSourceSize, withProcessedImage } from "./assetIntegrity.ts";
import { exactCropSourceRect, fitCropToAspect } from "./crop.ts";
import type { PhotoAsset } from "./exportPdf.ts";
const asset:PhotoAsset={
  id:"a",name:"image",url:"blob:original",pixelWidth:4000,pixelHeight:2000,
  widthMm:50.8,heightMm:50.8,quantity:2,focalX:50,focalY:50,
  crop:fitCropToAspect({x:0,y:0,width:1,height:1},4000,2000,50.8,50.8),
};
test("background mask resize preserves export compatibility",()=>{
 const after=withProcessedImage(asset,{url:"blob:edited",width:1600,height:800});
 assert.doesNotThrow(()=>exactCropSourceRect(1600,800,after.crop,50.8,50.8));
 assert.equal(after.url,asset.url);
 assert.equal(after.processedWidth,1600);
 const reset=withProcessedImage(after,null);
 assert.doesNotThrow(()=>exactCropSourceRect(4000,2000,reset.crop,50.8,50.8));
 assert.equal(reset.processedUrl,undefined);
});
test("asset limits refuse decompression-bomb dimensions before composing",()=>{
 assert.doesNotThrow(()=>assertSafeSourceSize(6000,6000));
 for(const [w,h] of [[0,100],[20000,100],[10000,6000],[Infinity,1],[NaN,1],[10.5,200]])
  assert.throws(()=>assertSafeSourceSize(w,h),/40-megapixel/);
});
