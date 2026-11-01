import assert from "node:assert/strict";
import test from "node:test";
import {createHighResolutionRaster} from "./highResRaster.ts";
import {DEFAULT_ADJUSTMENTS} from "./photoAdjustments.ts";
import type {PhotoAsset} from "./exportPdf.ts";

test("high-resolution tiles draw source photos with the configured opacity",async()=>{
 const originalImage=(globalThis as Record<string,unknown>).Image;
 const originalDocument=(globalThis as Record<string,unknown>).document;
 const alphas:number[]=[];
 let created=0;
 class MockImage{
  naturalWidth=400;naturalHeight=400;
  onload:(()=>void)|null=null;
  onerror:(()=>void)|null=null;
  set src(value:string){if(value)this.onload?.();}
 }
 const scratch={
  filter:"none",globalAlpha:1,imageSmoothingQuality:"low",
  save(){},restore(){},translate(_x:number,_y:number){},
  drawImage(_img:unknown,..._args:number[]){alphas.push(this.globalAlpha);},
 };
 const tile={drawImage(){}};
 try{
  Object.assign(globalThis,{Image:MockImage,document:{createElement:()=>{
   const index=++created;
   return {width:0,height:0,getContext:()=>index%2===1?scratch:tile};
  }}});
  const base:PhotoAsset={
   id:"opacity",name:"photo.png",url:"blob:photo",
   pixelWidth:400,pixelHeight:400,crop:{x:0,y:0,width:1,height:1},
   widthMm:50.8,heightMm:50.8,quantity:1,focalX:50,focalY:50,
  };
  for(const opacity of [0,50,100]){
   const raster=await createHighResolutionRaster({...base,
    adjustments:{...DEFAULT_ADJUSTMENTS,opacity}},120);
   raster.render(0,0,20,20);
   raster.dispose();
  }
  assert.deepEqual(alphas,[0,.5,1]);
 }finally{
  if(originalImage===undefined)delete (globalThis as Record<string,unknown>).Image;
  else (globalThis as Record<string,unknown>).Image=originalImage;
  if(originalDocument===undefined)delete (globalThis as Record<string,unknown>).document;
  else (globalThis as Record<string,unknown>).document=originalDocument;
 }
});
