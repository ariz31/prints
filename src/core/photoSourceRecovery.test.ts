import assert from "node:assert/strict";
import test from "node:test";
import {photoPreviewSource,photoSourceFailureMode,canCommitPhotoEdit,photoPreviewAsset}
 from "./photoSourceRecovery.ts";
import {exactCropSourceRect} from "./crop.ts";
import type {PhotoAsset} from "./exportPdf.ts";

const photo={url:"blob:original",processedUrl:"blob:processed"};
test("prefer processed image until it fails, then offer preview-only original",()=>{
 assert.equal(photoPreviewSource(photo,"primary"),"blob:processed");
 const fallback=photoSourceFailureMode(photo,"blob:processed","primary");
 assert.equal(fallback,"original");
 assert.equal(photoPreviewSource(photo,fallback),"blob:original");
 assert.equal(canCommitPhotoEdit(fallback,false,true),false);
 assert.equal(photoSourceFailureMode(photo,"blob:original",fallback),"unavailable");
 assert.equal(photoPreviewSource(photo,"unavailable"),null);
});
test("source without processed image does not loop through fallback",()=>{
 const source={url:"blob:original"};
 assert.equal(photoPreviewSource(source,"primary"),"blob:original");
 assert.equal(photoSourceFailureMode(source,"blob:original","primary"),"unavailable");
 assert.equal(photoSourceFailureMode({...source,processedUrl:"blob:original"},
  "blob:original","primary"),"unavailable");
});
test("a failed raster preview must block applying misleading adjustments",()=>{
 assert.equal(canCommitPhotoEdit("primary",false,true),true);
 assert.equal(canCommitPhotoEdit("primary",false,false),false);
 assert.equal(canCommitPhotoEdit("primary",true,true),false);
 assert.equal(canCommitPhotoEdit("original",false,true),false);
 assert.equal(canCommitPhotoEdit("original",true,true),false);
 assert.equal(canCommitPhotoEdit("unavailable",false,true),false);
});

test("fallback crop matches explicit Restore Original dimensions and keeps original immutable",()=>{
 const image:PhotoAsset={
  id:"id-1",name:"portrait.jpg",url:"blob:full",processedUrl:"blob:processed",
  pixelWidth:4000,pixelHeight:2000,processedWidth:1000,processedHeight:1000,
  crop:{x:.25,y:.1,width:.5,height:.8},widthMm:35,heightMm:45,quantity:2,
  focalX:50,focalY:50,
 };
 const preview=photoPreviewAsset(image,"original");
 assert.equal(preview.processedUrl,undefined);
 assert.equal(preview.processedWidth,undefined);
 assert.equal(preview.processedHeight,undefined);
 assert.equal(photoPreviewAsset(image,"primary"),image);
 assert.equal(photoPreviewAsset(image,"unavailable"),image);
 assert.deepEqual(image.crop,{x:.25,y:.1,width:.5,height:.8});
 assert.notDeepEqual(preview.crop,image.crop);
 assert.doesNotThrow(()=>exactCropSourceRect(image.pixelWidth,image.pixelHeight,
   preview.crop,image.widthMm,image.heightMm));
 // Print crop in the fallback must be the crop an explicit restore will save.
 assert.deepEqual(preview.crop,photoPreviewAsset(image,"original").crop);
});
