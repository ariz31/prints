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
 assert.ok((job.cuts?.length??0)>0);
});

test("ticket numbering remains intact with per-design quantities and mixed artwork",()=>{
 const cfg={...DEFAULT_PRINT_MODE,mode:"ticket" as const,quantity:3,grid:"10" as const,
   imageAssignment:"cycle" as const,quantityBasis:"per-design" as const,
   perImageQuantities:{a0:11,a1:4,a2:1,a3:1,a4:1}};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,18);
 assert.equal(job.pages.length,2);
 assert.deepEqual(job.pages[0].placements.slice(0,2).map(x=>x.serial?.text),["001","003"]);
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

test("all six print modes support every one of 1, 5, 10 and 25 designs",()=>{
 for(const count of [1,5,10,25])for(const mode of
   ["normal","notepad","ticket","rush-id","sticker","card"] as const){
   const chosen=Array.from({length:count},(_,i)=>({...sources[i%sources.length],
     id:"multi-"+mode+"-"+i,name:"Art "+i}));
   const cfg={...DEFAULT_PRINT_MODE,mode,imageAssignment:"cycle" as const,
     quantityBasis:"per-design" as const,grid:"10" as const};
   const job=createPrintModeJob(chosen,cfg);
   const used=new Set(job.pages.flatMap(page=>page.placements.map(item=>item.itemId)));
   assert.deepEqual(used,new Set(chosen.map(a=>a.id)),mode+" images "+count);
   assert.equal(job.total,count,mode+" pieces "+count);
   assert.equal(job.assets.length,count,mode+" source rasters "+count);
   assert.ok(job.pages.length>0&&job.pages.length<=200);
   assert.ok(job.pages.every(page=>page.placements.every(p=>p.widthMm>0&&p.heightMm>0)));
 }
});

test("explicit omissions are reported but never silently remapped",()=>{
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"selected" as const,
   includedImageIds:["a2","a4"],quantity:1};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,1);
 const coverage=inspectModeImageCoverage(sources,cfg,job);
 assert.equal(coverage.uploaded,5);
 assert.equal(coverage.included,2);
 assert.equal(coverage.printed,1);
 assert.equal(coverage.omitted.filter(x=>x.reason==="not-selected").length,3);
 assert.equal(coverage.unintended.length,1);
 assert.deepEqual(job.pages.flatMap(p=>p.placements.map(i=>i.itemId)),["a2"]);
});

test("ticket slots preserve original cut positions and use total quantities",()=>{
 const cfg={...DEFAULT_PRINT_MODE,mode:"ticket" as const,imageAssignment:"slots" as const,
   selectedImageId:"a0",slotImageIds:["a3","a2","a1"],quantity:20,grid:"10" as const};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,20);
 assert.deepEqual(job.pages[0].placements.slice(0,4).map(p=>p.itemId),["a3","a2","a1","a0"]);
 assert.deepEqual(job.pages[1].placements.slice(0,4).map(p=>p.itemId),["a3","a2","a1","a0"]);
 assert.equal(job.assets.reduce((sum,a)=>sum+a.quantity,0),20);
});

test("new assignment configuration stays valid in project settings and presets",async()=>{
 const {validProjectSettings}=await import("./projectStore.ts");
 const {validModePreset}=await import("./printModePresets.ts");
 const {validPrintModeConfig}=await import("./printModes.ts");
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"selected" as const,
   includedImageIds:["a0","a2"],quantityBasis:"per-design" as const,
   perImageQuantities:{a0:6,a2:3}};
 const original={paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,
   marginMm:5,gapMm:3,cutGuides:true,printModeConfig:cfg};
 assert.equal(validPrintModeConfig(cfg),true);
 assert.equal(validProjectSettings(original),true);
 assert.equal(validModePreset({id:"saved-1",name:"Multi portraits",config:cfg}),true);
 const restored=structuredClone(original);
 assert.deepEqual(restored,original);
 assert.equal(createPrintModeJob(sources,restored.printModeConfig).total,9);
 const legacy={...DEFAULT_PRINT_MODE,mode:"rush-id" as const,quantity:8};
 assert.equal(createPrintModeJob(sources,legacy).total,8);
 assert.equal(createPrintModeJob(sources,legacy).assets.length,1);
 assert.equal(validProjectSettings({...original,printModeConfig:legacy}),true);
});

test("invalid assignment fields cannot bypass preset and project validation",async()=>{
 const {validPrintModeConfig}=await import("./printModes.ts");
 const {validProjectSettings}=await import("./projectStore.ts");
 const base={...DEFAULT_PRINT_MODE,quantityBasis:"per-design" as const};
 assert.equal(validPrintModeConfig({...base,imageAssignment:"selected",includedImageIds:["a0","a0"]}),false);
 assert.equal(validPrintModeConfig({...base,perImageQuantities:{a0:0}}),false);
 assert.equal(validPrintModeConfig({...base,perImageQuantities:{a0:1001}}),false);
 assert.equal(validPrintModeConfig({...base,imageAssignment:"slots"}),false);
 const project={paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,
   marginMm:5,gapMm:3,cutGuides:true,printModeConfig:{...base,perImageQuantities:{a0:0}}};
 assert.equal(validProjectSettings(project),false);
});

test("asset removal is visible in chosen-image mode, not silently replaced",()=>{
 const cfg={...DEFAULT_PRINT_MODE,imageAssignment:"selected" as const,
   includedImageIds:["a0","a2"],quantityBasis:"per-design" as const};
 assert.throws(()=>createPrintModeJob(sources.filter(a=>a.id!=="a2"),cfg),/missing/);
});

test("legacy Notepad cycle and slot configs still repeat one explicit source",()=>{
 for(const assignment of ["cycle","slots"] as const){
   const cfg={...DEFAULT_PRINT_MODE,mode:"notepad" as const,
     imageAssignment:assignment,selectedImageId:"a2",quantity:12,grid:"4" as const};
   const job=createPrintModeJob(sources,cfg);
   assert.deepEqual(new Set(job.pages.flatMap(p=>p.placements.map(i=>i.itemId))),new Set(["a2"]));
   assert.equal(job.total,12);
 }
});

test("legacy non-ticket slot mapping remains printable after validation",()=>{
 const cfg={...DEFAULT_PRINT_MODE,mode:"normal" as const,
   imageAssignment:"slots" as const,quantity:5};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.total,5);
 assert.equal(job.assets.length,5);
 assert.deepEqual(new Set(job.pages.flatMap(p=>p.placements.map(x=>x.itemId))),
   new Set(sources.map(a=>a.id)));
});

test("exporting a PDF page subset reports actually included artwork",()=>{
 const cfg={...DEFAULT_PRINT_MODE,mode:"notepad" as const,grid:"4" as const,
   quantityBasis:"per-design" as const,imageAssignment:"cycle" as const};
 const job=createPrintModeJob(sources,cfg);
 assert.equal(job.pages.length,5);
 const whole=inspectModeImageCoverage(sources,cfg,job);
 const firstPage=inspectModeImageCoverage(sources,cfg,{pages:[job.pages[0]]});
 assert.equal(whole.printed,5);
 assert.equal(firstPage.printed,1);
 assert.equal(firstPage.omitted.length,4);
 assert.equal(firstPage.included,5);
});
