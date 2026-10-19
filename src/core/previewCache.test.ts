import assert from "node:assert/strict";
import test from "node:test";
import {cropPreviewKey} from "./previewCache.ts";
import type {PhotoAsset} from "./exportPdf.ts";
const asset:PhotoAsset={id:"item",name:"Photo",url:"blob:src",pixelWidth:1000,
 pixelHeight:1000,crop:{x:0,y:0,width:1,height:1},widthMm:50.8,
 heightMm:50.8,quantity:4,focalX:50,focalY:50};
test("quantity and vector edits reuse the existing cropped image preview",()=>{
 const original=cropPreviewKey(asset);
 assert.equal(cropPreviewKey({...asset,quantity:50,layers:[{
   id:"s",name:"Shape",kind:"rectangle",visible:true,
   x:0,y:0,width:.3,height:.4,color:"#112233"}]}),original);
});
test("crop, image processing, size, and tonal edits invalidate cached raster",()=>{
 const baseline=cropPreviewKey(asset);
 const changes:PhotoAsset[]=[
  {...asset,crop:{x:.1,y:.1,width:.8,height:.8}},
  {...asset,processedUrl:"blob:mask",processedWidth:500,processedHeight:500},
  {...asset,widthMm:25.4},
  {...asset,adjustments:{brightness:10,contrast:0,saturation:0}},
  {...asset,pixelWidth:900},
 ];
 changes.forEach(item=>assert.notEqual(cropPreviewKey(item),baseline));
});
