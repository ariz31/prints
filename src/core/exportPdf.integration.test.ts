import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument,PDFPage,rgb } from "pdf-lib";
import { exportToPdf } from "./exportPdf.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import { composeSheets, PDF_POINTS_PER_MM } from "./layout.ts";
import {applyManualPlacements,moveManualPlacement} from "./manualLayout.ts";
import {composeNotepadSheets,notepadCutLines,notepadGrid} from "./notepadLayout.ts";
import type {NotepadPresetId} from "./notepadLayout.ts";

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

test("corner cut-mark PDF retains exact pages and validates clearance",async()=>{
 const pages=composeSheets([{...asset,quantity:2}],a4);
 const mock=async()=>new Blob([new Uint8Array(png)],{type:"image/png"});
 const blob=await exportToPdf([asset],pages,{widthMm:210,heightMm:297},true,
   mock,"corner",{marginMm:5,gapMm:3});
 const pdf=await PDFDocument.load(await blob.arrayBuffer());
 assert.equal(pdf.getPageCount(),1);
 assert.ok(Math.abs(pdf.getPages()[0].getWidth()-210*PDF_POINTS_PER_MM)<.01);
 await assert.rejects(exportToPdf([asset],pages,{widthMm:210,heightMm:297},true,
   mock,"corner",{marginMm:1,gapMm:3}),/Corner cut marks/);
});

test("notepad PDF uses exact A4 cuts and retains six equal printable cells",async()=>{
 const paper={widthMm:210,heightMm:297};
 const grid=notepadGrid("6",paper,"portrait",5);
 const single:PhotoAsset={...asset,widthMm:grid.artWidthMm,heightMm:grid.artHeightMm,
   quantity:6,layers:[]};
 const sheets=composeNotepadSheets([single],"6",paper,"portrait",5);
 assert.equal(sheets.length,1);
 assert.equal(sheets[0].placements.length,6);
 const cuts=notepadCutLines("6",paper,"portrait",5);
 const mock=async()=>new Blob([new Uint8Array(png)],{type:"image/png"});
 // Notepad guides supersede normal corner-mark clearance requirements.
 const blob=await exportToPdf([single],sheets,paper,true,mock,"corner",
   {marginMm:5,gapMm:0},300,{notepadCuts:cuts});
 const pdf=await PDFDocument.load(await blob.arrayBuffer());
 assert.equal(pdf.getPageCount(),1);
 assert.ok(Math.abs(pdf.getPage(0).getWidth()-210*PDF_POINTS_PER_MM)<.01);
 assert.ok(Math.abs(pdf.getPage(0).getHeight()-297*PDF_POINTS_PER_MM)<.01);
});

test("A4 notepad exports use faint vector guides at exact cuts and honor the toggle",async()=>{
 const paper={widthMm:210,heightMm:297};
 const grid=notepadGrid("6",paper,"portrait",5);
 const single:PhotoAsset={...asset,widthMm:grid.artWidthMm,heightMm:grid.artHeightMm,
   quantity:6,layers:[]};
 const sheets=composeNotepadSheets([single],"6",paper,"portrait",5);
 const cuts=notepadCutLines("6",paper,"portrait",5);
 const mock=async()=>new Blob([new Uint8Array(png)],{type:"image/png"});
 const captured:Parameters<PDFPage["drawLine"]>[0][]=[];
 const original=PDFPage.prototype.drawLine;
 PDFPage.prototype.drawLine=function(this:PDFPage,options){
   captured.push(options);
   return original.call(this,options);
 };
 try{
   await exportToPdf([single],sheets,paper,true,mock,"outline",
     {marginMm:5,gapMm:0},300,{notepadCuts:cuts});
   assert.equal(captured.length,cuts.length,"one vector line per physical cut");
   captured.forEach((line,index)=>{
     const cut=cuts[index];
     assert.equal(line.thickness,0.15,"the PDF cut line must remain a faint hairline");
     assert.deepEqual(line.color,rgb(208/255,208/255,208/255),
       "the PDF guide must be light gray, not the old dark charcoal");
     assert.ok(Math.abs(line.start.x-cut.x1*PDF_POINTS_PER_MM)<1e-8);
     assert.ok(Math.abs(line.start.y-(paper.heightMm-cut.y1)*PDF_POINTS_PER_MM)<1e-8);
     assert.ok(Math.abs(line.end.x-cut.x2*PDF_POINTS_PER_MM)<1e-8);
     assert.ok(Math.abs(line.end.y-(paper.heightMm-cut.y2)*PDF_POINTS_PER_MM)<1e-8);
   });
   captured.length=0;
   await exportToPdf([single],sheets,paper,false,mock,"outline",
     {marginMm:5,gapMm:0},300,{notepadCuts:cuts});
   assert.equal(captured.length,0,"disabled cut guides never print");
 }finally{
   PDFPage.prototype.drawLine=original;
 }
});


/** The expected cut-piece dimensions are specified independently of
 * notepadGrid(), so a systematic layout calculation error cannot certify
 * itself. Width and height refer to the FULL cut piece, not inset artwork. */
test("every A4 notepad preset exports exact physical page, image and cut sizes",async()=>{
 const portraitCells:ReadonlyArray<readonly [NotepadPresetId,number,number]>=[
   ["2",210,148.5],["3",210,99],["4",105,148.5],["6",105,99],
   ["8",105,74.25],["9",70,99],["10",105,59.4],["12",70,74.25],
 ];
 const insetMm=5;
 const mock=async()=>new Blob([new Uint8Array(png)],{type:"image/png"});
 const images:Parameters<PDFPage["drawImage"]>[1][]=[];
 const lines:Parameters<PDFPage["drawLine"]>[0][]=[];
 const drawImage=PDFPage.prototype.drawImage;
 const drawLine=PDFPage.prototype.drawLine;
 const near=(actual:number|undefined,expected:number,description:string)=>{
   assert.ok(actual!==undefined&&Number.isFinite(actual)&&
     Math.abs(actual-expected)<0.00001,
     description+": expected "+expected+" PDF points, got "+actual);
 };
 PDFPage.prototype.drawImage=function(this:PDFPage,image,options){
   images.push(options);
   return drawImage.call(this,image,options);
 };
 PDFPage.prototype.drawLine=function(this:PDFPage,options){
   lines.push(options);
   return drawLine.call(this,options);
 };
 try{
   for(const [preset,portraitWidthMm,portraitHeightMm] of portraitCells){
     for(const orientation of ["portrait","landscape"] as const){
       const paper=orientation==="portrait"
         ?{widthMm:210,heightMm:297}:{widthMm:297,heightMm:210};
       const cellW=orientation==="portrait"?portraitWidthMm:portraitHeightMm;
       const cellH=orientation==="portrait"?portraitHeightMm:portraitWidthMm;
       const columns=Math.round(paper.widthMm/cellW);
       const rows=Math.round(paper.heightMm/cellH);
       const count=Number(preset);
       assert.equal(columns*rows,count,preset+" "+orientation+" expected cut count");
       const grid=notepadGrid(preset,paper,orientation,insetMm);
       near(grid.cellWidthMm,cellW,preset+" "+orientation+" cut width");
       near(grid.cellHeightMm,cellH,preset+" "+orientation+" cut height");
       near(grid.artWidthMm,cellW-2*insetMm,preset+" "+orientation+" artwork width");
       near(grid.artHeightMm,cellH-2*insetMm,preset+" "+orientation+" artwork height");
       const design:PhotoAsset={...asset,quantity:count,layers:[],
         widthMm:cellW-2*insetMm,heightMm:cellH-2*insetMm};
       const pages=composeNotepadSheets([design],preset,paper,orientation,insetMm);
       const cuts=notepadCutLines(preset,paper,orientation,insetMm);
       assert.equal(pages.length,1);
       images.length=0;lines.length=0;
       const blob=await exportToPdf([design],pages,paper,true,mock,"outline",
         {marginMm:insetMm,gapMm:0},300,{notepadCuts:cuts});
       const pdf=await PDFDocument.load(await blob.arrayBuffer());
       assert.equal(pdf.getPageCount(),1,preset+" "+orientation+" page count");
       near(pdf.getPage(0).getWidth(),paper.widthMm*PDF_POINTS_PER_MM,
         preset+" "+orientation+" page width");
       near(pdf.getPage(0).getHeight(),paper.heightMm*PDF_POINTS_PER_MM,
         preset+" "+orientation+" page height");
       assert.equal(images.length,count,preset+" "+orientation+" PDF artwork count");
       images.forEach((image,index)=>{
         const col=index%columns,row=Math.floor(index/columns);
         near(image.width,(cellW-2*insetMm)*PDF_POINTS_PER_MM,"artwork width");
         near(image.height,(cellH-2*insetMm)*PDF_POINTS_PER_MM,"artwork height");
         near(image.x,(col*cellW+insetMm)*PDF_POINTS_PER_MM,"artwork x");
         near(image.y,(paper.heightMm-(row+1)*cellH+insetMm)*PDF_POINTS_PER_MM,"artwork y");
       });
       const expectedCuts:typeof cuts=[];
       for(let col=1;col<columns;col++)expectedCuts.push({
         x1:col*cellW,y1:insetMm,x2:col*cellW,y2:paper.heightMm-insetMm,
       });
       for(let row=1;row<rows;row++)expectedCuts.push({
         x1:insetMm,y1:row*cellH,x2:paper.widthMm-insetMm,y2:row*cellH,
       });
       assert.equal(lines.length,expectedCuts.length,preset+" "+orientation+" cut lines");
       lines.forEach((line,index)=>{
         const cut=expectedCuts[index];
         near(line.start.x,cut.x1*PDF_POINTS_PER_MM,"cut start x");
         near(line.start.y,(paper.heightMm-cut.y1)*PDF_POINTS_PER_MM,"cut start y");
         near(line.end.x,cut.x2*PDF_POINTS_PER_MM,"cut end x");
         near(line.end.y,(paper.heightMm-cut.y2)*PDF_POINTS_PER_MM,"cut end y");
       });
     }
   }
 }finally{
   PDFPage.prototype.drawImage=drawImage;
   PDFPage.prototype.drawLine=drawLine;
 }
});

test("PDF text overflow fails consistently before writing invalid output",async()=>{
 const altered={...asset,layers:[{...asset.layers![0],height:.01}]};
 const pages=composeSheets([{...altered,quantity:1}],a4);
 await assert.rejects(exportToPdf([altered],pages,{widthMm:210,heightMm:297},false,
   async()=>new Blob([new Uint8Array(png)],{type:"image/png"})),
   /design box height/);
});

test("A3 sheet geometry retains exact ID-photo sizes and manual positions",async()=>{
 const settings={paperWidthMm:297,paperHeightMm:420,marginMm:5,gapMm:3};
 const oneInch:PhotoAsset={...asset,id:"one-inch",widthMm:25.4,heightMm:25.4,
   quantity:3,crop:{x:0,y:0,width:1,height:1},layers:[]};
 const twoInch:PhotoAsset={...asset,id:"two-inch",widthMm:50.8,heightMm:50.8,
   quantity:2,crop:{x:0,y:0,width:1,height:1},layers:[]};
 const automatic=composeSheets([oneInch,twoInch],settings);
 assert.equal(automatic.length,1);
 const shifted=moveManualPlacement(automatic,[],settings,0,"one-inch",0,5,100);
 const moved=applyManualPlacements(automatic,shifted,settings);
 assert.equal(moved[0].placements.length,5);
 const relocated=moved[0].placements.find(p=>p.itemId==="one-inch"&&p.copyIndex===0)!;
 assert.equal(relocated.xMm,5);
 assert.equal(relocated.yMm,100);
 assert.equal(relocated.widthMm,25.4);
 const exported=await exportToPdf([oneInch,twoInch],moved,
   {widthMm:297,heightMm:420},true,
   async()=>new Blob([new Uint8Array(png)],{type:"image/png"}));
 const pdf=await PDFDocument.load(await exported.arrayBuffer());
 assert.equal(pdf.getPageCount(),1);
 assert.ok(Math.abs(pdf.getPage(0).getWidth()-297*PDF_POINTS_PER_MM)<0.01);
 assert.ok(Math.abs(pdf.getPage(0).getHeight()-420*PDF_POINTS_PER_MM)<0.01);
 for(const placement of moved[0].placements){
   assert.ok(placement.xMm>=settings.marginMm);
   assert.ok(placement.yMm>=settings.marginMm);
   assert.ok(placement.xMm+placement.widthMm<=settings.paperWidthMm-settings.marginMm);
   assert.ok(placement.yMm+placement.heightMm<=settings.paperHeightMm-settings.marginMm);
 }
});
