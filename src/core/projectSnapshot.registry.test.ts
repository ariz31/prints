import assert from "node:assert/strict";
import test from "node:test";
import {createProjectSnapshot} from "./projectStore.ts";
import type {ProjectSettings} from "./projectStore.ts";
import type {PhotoAsset} from "./exportPdf.ts";
import {registerPhotoBlob,releasePhotoBlobUrl} from "./photoBlobRegistry.ts";

test("snapshots use retained original and processed Blobs without refetching URLs",async()=>{
 const original=new Blob(["original"],{type:"image/jpeg"});
 const processed=new Blob(["processed"],{type:"image/png"});
 const url=URL.createObjectURL(original),processedUrl=URL.createObjectURL(processed);
 registerPhotoBlob(url,original);registerPhotoBlob(processedUrl,processed);
 const settings:ProjectSettings={paper:"A4",orientation:"portrait",customWidthMm:210,
   customHeightMm:297,marginMm:5,gapMm:2,cutGuides:false};
 const item:PhotoAsset={id:"photo-1",name:"example.jpg",url,processedUrl,
   pixelWidth:1000,pixelHeight:1000,processedWidth:1000,processedHeight:1000,
   crop:{x:0,y:0,width:1,height:1},widthMm:50.8,heightMm:50.8,
   quantity:1,focalX:50,focalY:50};
 const fetchBefore=globalThis.fetch;
 globalThis.fetch=(()=>{throw new Error("Unexpected fetch");}) as typeof fetch;
 try {
  const snapshot=await createProjectSnapshot("draft","Draft",settings,[item]);
  assert.strictEqual(snapshot.assets[0].original,original);
  assert.strictEqual(snapshot.assets[0].processed,processed);
 } finally {
  globalThis.fetch=fetchBefore;
  releasePhotoBlobUrl(url);releasePhotoBlobUrl(processedUrl);
 }
});
