import assert from "node:assert/strict";
import test from "node:test";
import {assessPrintJob,unsupportedPdfText} from "./printPreflight.ts";
import type {PhotoAsset} from "./exportPdf.ts";
const base:PhotoAsset={id:"a",name:"Portrait",url:"blob:test",pixelWidth:600,
 pixelHeight:600,crop:{x:0,y:0,width:1,height:1},
 widthMm:50.8,heightMm:50.8,quantity:4,focalX:50,focalY:50};
const pages=[{placements:[{itemId:"a",copyIndex:0,xMm:5,yMm:5,
 widthMm:50.8,heightMm:50.8}]}];
const paper={widthMm:210,heightMm:297};
test("preflight accepts accurate 300 DPI crops",()=>{
 const report=assessPrintJob([base],pages,paper);
 assert.equal(report.errors.length,0);assert.equal(report.warnings.length,0);
 assert.equal(report.lowestDpi,300);assert.equal(report.totalCopies,4);
});
test("preflight flags resolution and blocks hidden secondary crop",()=>{
 const low=assessPrintJob([{...base,pixelWidth:100,pixelHeight:100}],pages,paper);
 assert.ok(low.warnings.some(e=>e.code==="low-resolution"));
 const wrong=assessPrintJob([{...base,pixelWidth:1200,pixelHeight:600}],pages,paper);
 assert.ok(wrong.errors.some(e=>e.code==="crop"));
});
test("missing items, heavy batches, and malformed layers are actionable",()=>{
 assert.ok(assessPrintJob([],[],paper).errors.some(e=>e.code==="no-images"));
 assert.ok(assessPrintJob([base],Array.from({length:201},()=>pages[0]),paper)
   .errors.some(e=>e.code==="too-many-sheets"));
 const layer={id:"text",kind:"text" as const,name:"Caption",visible:true,
 x:0,y:0,width:.9,height:.2,color:"#000000",fontSizePt:10,text:"Hello 😀"};
 assert.ok(assessPrintJob([{...base,layers:[layer]}],pages,paper)
   .errors.some(e=>e.code==="unsupported-text"));
});
test("standard PDF text gate accepts WinAnsi punctuation but blocks emojis",()=>{
 assert.equal(unsupportedPdfText("Hello € — café"),false);
 assert.equal(unsupportedPdfText("Sample\nLabel"),false);
 assert.equal(unsupportedPdfText("Student 😀"),true);
});

test("preflight blocks missing bundled-font glyphs before export",()=>{
 const caption={id:"label",kind:"text" as const,name:"Caption",visible:true,
   x:0,y:0,width:.8,height:.3,color:"#000000",fontSizePt:12,
   text:"Ж",bundledFontId:"crimson-text"};
 const missing=assessPrintJob([{...base,layers:[caption]}],pages,paper);
 assert.ok(missing.errors.some(issue=>issue.code==="unsupported-bundled-font-text"));
 const supported=assessPrintJob([{...base,layers:[{...caption,bundledFontId:"lato"}]}],pages,paper);
 assert.ok(!supported.errors.some(issue=>issue.code==="unsupported-bundled-font-text"));
});

test("preflight catches a text layer too short to fit its captions",()=>{
 const caption={id:"label",kind:"text" as const,name:"Caption",visible:true,
   x:0,y:0,width:.8,height:.02,color:"#000000",fontSizePt:14,text:"ID"};
 const report=assessPrintJob([{...base,layers:[caption]}],pages,paper);
 assert.ok(report.errors.some(e=>e.code==="text-overflow"));
 const fine=assessPrintJob([{...base,layers:[{...caption,height:.3}]}],pages,paper);
 assert.equal(fine.errors.some(e=>e.code==="text-overflow"),false);
});

test("A3 preflight permits actual tiled 300 and 600 DPI, warns only about source detail",()=>{
  const large:PhotoAsset={...base,pixelWidth:6000,pixelHeight:8500,
    widthMm:297,heightMm:420,crop:{x:0,y:0,width:1,height:1}};
  const pagesA3=[{placements:[{itemId:"a",copyIndex:0,xMm:0,yMm:0,widthMm:297,heightMm:420}]}];
  const report=assessPrintJob([large],pagesA3,{widthMm:297,heightMm:420});
  assert.equal(report.errors.length,0);
  assert.equal(report.warnings.some(w=>w.code==="raster-limit"),false);
  assert.equal(report.lowestDpi,300);
  const high=assessPrintJob([large],pagesA3,{widthMm:297,heightMm:420},undefined,600);
  assert.equal(high.errors.length,0);
  assert.ok(high.warnings.some(w=>w.code==="source-dpi"));
  assert.ok(high.lowestDpi!==null&&high.lowestDpi>=500);
});
test("small finished products retain 300 DPI without misleading cap warnings",()=>{
  const report=assessPrintJob([base],pages,paper);
  assert.equal(report.warnings.some(w=>w.code==="raster-limit"),false);
  assert.equal(report.lowestDpi,300);
});
