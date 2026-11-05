import assert from "node:assert/strict";
import test from "node:test";
import {PDFDocument} from "pdf-lib";
import {exportToPdf} from "./exportPdf.ts";
const paper={widthMm:210,heightMm:297};
const pages=[{placements:[]},{placements:[]}];

test("PDF progress includes page completion and preserves physical paper dimensions",async()=>{
 const ticks:Array<[number,number]>=[];
 const file=await exportToPdf([],pages,paper,false,undefined,"outline",undefined,300,{
  onProgress:(done,total)=>ticks.push([done,total]),
 });
 assert.deepEqual(ticks,[[0,2],[1,2],[2,2]]);
 assert.equal(file.type,"application/pdf");
 const pdf=await PDFDocument.load(await file.arrayBuffer());
 assert.equal(pdf.getPageCount(),2);
 assert.ok(Math.abs(pdf.getPage(0).getWidth()-210*72/25.4)<.001);
 assert.ok(Math.abs(pdf.getPage(0).getHeight()-297*72/25.4)<.001);
});

test("already-aborted PDF export refuses to allocate a document",async()=>{
 const c=new AbortController();c.abort();
 await assert.rejects(exportToPdf([],pages,paper,false,undefined,"outline",undefined,300,
  {signal:c.signal}),/canceled/);
});

test("canceling after a completed page prevents any downloadable result",async()=>{
 const c=new AbortController();
 const ticks:number[]=[];
 await assert.rejects(exportToPdf([],pages,paper,false,undefined,"outline",undefined,300,{
  signal:c.signal,onProgress:(done)=>{ticks.push(done);if(done===1)c.abort();}
 }),/canceled/);
 assert.deepEqual(ticks,[0,1]);
});
