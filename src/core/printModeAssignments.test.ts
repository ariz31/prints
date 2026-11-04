import test from "node:test";
import assert from "node:assert/strict";
import type {PhotoAsset} from "./exportPdf.ts";
import {DEFAULT_PRINT_MODE,createPrintModeJob} from "./printModes.ts";
import {resolveModeImageAssignments,inspectModeImageCoverage} from "./printModeAssignments.ts";

const sources:PhotoAsset[]=Array.from({length:5},(_,i)=>({
 id:"a"+i,name:"Design "+i,url:"blob:local",pixelWidth:1200,pixelHeight:1200,
 crop:{x:0,y:0,width:1,height:1},widthMm:35,heightMm:35,quantity:1,
 focalX:50,focalY:50,layers:[],
}));

test("multi-image selection preserves source order, no unintentional omissions",()=>{
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"cycle" as const,quantityBasis:"per-design" as const};
 const selection=resolveModeImageAssignments(sources,cfg);
 assert.equal(selection.total,5);
 assert.deepEqual(selection.sequence.map(a=>a.id),sources.map(a=>a.id));
 assert.equal(inspectModeImageCoverage(sources,cfg,createPrintModeJob(sources,cfg)).printed,5);
});

test("selected designs and uneven per-design copies maintain deterministic round robin",()=>{
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"selected" as const,
   includedImageIds:["a0","a2","a4"],quantityBasis:"per-design" as const,
   perImageQuantities:{a0:3,a2:1,a4:2}};
 const job=createPrintModeJob(sources,cfg);
 assert.deepEqual(job.pages.flatMap(page=>page.placements.map(p=>p.itemId)),
   ["a0","a2","a4","a0","a4","a0"]);
 const coverage=inspectModeImageCoverage(sources,cfg,job);
 assert.equal(coverage.printed,3);assert.equal(coverage.omitted.length,2);
 assert.equal(coverage.unintended.length,0);
 assert.equal(job.total,6);
});

test("legacy quantity means total pieces even if less than imported designs",()=>{
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"cycle" as const,quantity:2};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,2);
 assert.equal(inspectModeImageCoverage(sources,cfg,job).unintended.length,3);
});

test("missing selection, no selected items and oversized per-design jobs fail explicitly",()=>{
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"selected" as const,
   includedImageIds:["a0","missing"],quantityBasis:"per-design" as const};
 assert.throws(()=>createPrintModeJob(sources,cfg),/missing/);
 assert.throws(()=>createPrintModeJob(sources,{...cfg,includedImageIds:[]}),/Select at least one/);
 assert.throws(()=>createPrintModeJob(sources,{...cfg,includedImageIds:["a0","a1"],perImageQuantities:{a0:700,a1:700}}),/1,000/);
});

test("multi-design notepad batches one artwork per sheet and preserves exact count",()=>{
 const cfg={...DEFAULT_PRINT_MODE,mode:"notepad" as const,grid:"4" as const,
   imageAssignment:"selected" as const,includedImageIds:["a0","a2"],
   quantityBasis:"per-design" as const,perImageQuantities:{a0:5,a2:6}};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,11);
 assert.equal(job.pages.length,4);
 assert.deepEqual(job.pages.map(p=>p.placements.map(x=>x.itemId)),[
   ["a0","a0","a0","a0"],["a0"],["a2","a2","a2","a2"],["a2","a2"],
 ]);
 assert.equal(job.cuts?.length,4);
});

test("ticket numbering remains intact with per-design quantities and mixed artwork",()=>{
 const cfg={...DEFAULT_PRINT_MODE,mode:"ticket" as const,quantity:3,grid:"10" as const,
   imageAssignment:"cycle" as const,quantityBasis:"per-design" as const,
   perImageQuantities:{a0:11,a1:4,a2:1,a3:1,a4:1}};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,18);
 assert.equal(job.pages.length,2);
 assert.deepEqual(job.pages[0].placements.slice(0,2).map(x=>x.serial?.text),["001","012"]);
 assert.equal(new Set(job.pages.flatMap(page=>page.placements.map(p=>p.itemId))).size,5);
});

test("newly imported design receives a default single copy without mutating stored source",()=>{
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"cycle" as const,quantityBasis:"per-design" as const,
   perImageQuantities:{a0:3}};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,7);
 assert.equal(job.assets.find(a=>a.id==="a0")?.quantity,3);
 assert.equal(sources[0].quantity,1);
});
