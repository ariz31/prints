import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { exportToPdf } from "./exportPdf.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import { composeSheets, PDF_POINTS_PER_MM } from "./layout.ts";

const png=Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n6sAAAAASUVORK5CYII=",
  "base64"
);
const asset:PhotoAsset={
  id:"photo",name:"photo.png",url:"blob:unused",pixelWidth:2000,pixelHeight:2000,
  crop:{x:0,y:0,width:1,height:1},widthMm:50.8,heightMm:50.8,
  quantity:30,focalX:50,focalY:50,
  layers:[{id:"label",kind:"text",name:"Test",visible:true,
    x:.05,y:.05,width:.8,height:.4,color:"#000000",fontSizePt:10,text:"ID"}],
};
const a4={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:3};
test("PDF export preserves physical A4 dimensions, pagination and vector layers",async()=>{
  const pages=composeSheets([asset],a4);
  const data=await exportToPdf([asset],pages,{widthMm:210,heightMm:297},true,
    async()=>new Blob([new Uint8Array(png)],{type:"image/png"}));
  const pdf=await PDFDocument.load(await data.arrayBuffer());
  assert.equal(pdf.getPageCount(),2);
  for(const page of pdf.getPages()){
    assert.ok(Math.abs(page.getWidth()-210*PDF_POINTS_PER_MM)<.01);
    assert.ok(Math.abs(page.getHeight()-297*PDF_POINTS_PER_MM)<.01);
  }
});
test("PDF refuses out-of-bounds jobs before allocating image buffers",async()=>{
  await assert.rejects(exportToPdf([asset],
    Array.from({length:201},()=>({placements:[]})),{widthMm:210,heightMm:297},false),
  /over 200 sheets/);
  const full=Array.from({length:25},(_,i)=>({
    ...asset,id:String(i),widthMm:500,heightMm:500,quantity:1,
  }));
  const placements=full.map((a)=>({
    itemId:a.id,copyIndex:0,xMm:0,yMm:0,widthMm:500,heightMm:500
  }));
  await assert.rejects(exportToPdf(full,[{placements}],
    {widthMm:600,heightMm:600},false),/too much image memory/);
});
