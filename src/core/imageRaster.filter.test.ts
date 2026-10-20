import assert from "node:assert/strict";
import test from "node:test";
import {rasterizeCrop} from "./imageRaster.ts";
import type {PhotoAsset} from "./exportPdf.ts";
import {photoFilterCss} from "./photoAdjustments.ts";

test("PDF/PNG raster pipeline applies the identical CSS preview filter once to the exact crop",async()=>{
 const calls:Array<{filter:string;source:number[];destination:number[]}>=[];
 const context={
   filter:"none",imageSmoothingQuality:"low",
   clearRect(){},
   drawImage(_image:unknown,...p:number[]){
     calls.push({filter:this.filter,source:p.slice(0,4),destination:p.slice(4)});
   },
 };
 const canvas={
   width:0,height:0,
   getContext:(kind:string)=>kind==="2d"?context:null,
   toBlob:(done:(blob:Blob|null)=>void)=>done(new Blob([new Uint8Array([137])],{type:"image/png"})),
 };
 const originalImage=(globalThis as Record<string,unknown>).Image;
 const originalDocument=(globalThis as Record<string,unknown>).document;
 class MockImage{
   naturalWidth=600;naturalHeight=400;onload:(()=>void)|null=null;
   onerror:(()=>void)|null=null;
   set src(_url:string){this.onload?.();}
 }
 try{
   Object.assign(globalThis,{
     Image:MockImage,
     document:{createElement:()=>canvas},
   });
   const asset:PhotoAsset={
     id:"sample",name:"photo.png",url:"blob:sample",pixelWidth:600,pixelHeight:400,
     crop:{x:1/6,y:0,width:2/3,height:1},
     widthMm:50.8,heightMm:50.8,quantity:1,focalX:50,focalY:50,
     adjustments:{brightness:22,contrast:-15,saturation:60},
   };
   assert.equal((await rasterizeCrop(asset,120)).type,"image/png");
   assert.equal(calls.length,1);
   assert.equal(calls[0].filter,photoFilterCss(asset.adjustments));
   for(const [actual,expected] of calls[0].source.map((v,i)=>[v,[100,0,400,400][i]])){
     assert.ok(Math.abs(actual-expected)<0.00001, "Source crop mismatch");
   }
   assert.deepEqual(calls[0].destination,[0,0,240,240]);
   const neutral={...asset,adjustments:undefined};
   await rasterizeCrop(neutral,120);
   assert.equal(calls[1].filter,"none");
 }finally{
   if(originalImage===undefined)delete (globalThis as Record<string,unknown>).Image;
   else (globalThis as Record<string,unknown>).Image=originalImage;
   if(originalDocument===undefined)delete (globalThis as Record<string,unknown>).document;
   else (globalThis as Record<string,unknown>).document=originalDocument;
 }
});
