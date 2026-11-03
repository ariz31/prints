import assert from "node:assert/strict";
import test from "node:test";
import {PDFDocument,PDFPage} from "pdf-lib";
import {DEFAULT_PRINT_MODE,createPrintModeJob,cutGridLines,modeDefaults,numberedTicket,validPrintModeConfig,verifyTicketLabel} from "./printModes.ts";
import type {PrintModeConfig} from "./printModes.ts";
import {exportToPdf} from "./exportPdf.ts";
import type {PhotoAsset} from "./exportPdf.ts";
import {PDF_POINTS_PER_MM} from "./layout.ts";
import {validModePreset} from "./printModePresets.ts";
const asset:PhotoAsset={
 id:"a",name:"Ticket artwork",url:"blob:local",pixelWidth:2000,pixelHeight:1500,
 crop:{x:0,y:0,width:1,height:1},widthMm:90,heightMm:50,quantity:1,
 focalX:50,focalY:50,layers:[],
};
const ticket:PrintModeConfig={...DEFAULT_PRINT_MODE,mode:"ticket",quantity:100,grid:"10"};
const labels=(job:ReturnType<typeof createPrintModeJob>,p:number)=>job.pages[p].placements.map(x=>x.serial?.text);

test("print mode configuration is validated and defaults remain non-destructive",()=>{
 assert.ok(validPrintModeConfig(DEFAULT_PRINT_MODE));
 assert.ok(validPrintModeConfig(ticket));
 assert.equal(validPrintModeConfig({...ticket,quantity:1001}),false);
 assert.equal(validPrintModeConfig({...ticket,numberPrefix:"é"}),false);
 assert.equal(modeDefaults("notepad",ticket).paper,"A4");
 const before=structuredClone(asset);
 createPrintModeJob([asset],ticket);
 assert.deepEqual(asset,before,"mode planning must not change source artwork");
});
test("ticket grid: 100 tickets, 10 per page, 10 sheets with exact cut-and-stack serials",()=>{
 const job=createPrintModeJob([asset],ticket);
 assert.equal(job.pages.length,10);
 assert.equal(job.total,100);
 assert.deepEqual(labels(job,0),["001","011","021","031","041","051","061","071","081","091"]);
 assert.deepEqual(labels(job,1),["002","012","022","032","042","052","062","072","082","092"]);
 assert.deepEqual(labels(job,9),["010","020","030","040","050","060","070","080","090","100"]);
 assert.equal(job.grid?.columns,2);assert.equal(job.grid?.rows,5);
 assert.ok(Math.abs(job.paper.widthMm-210)<1e-8);
 assert.equal(job.cuts?.length,5);
 assert.equal(job.assets[0].quantity,100);
});
test("partial cut-and-stack jobs stay gap-free when stacked by cut position",()=>{
 for(const count of [1,17,99,101,113]){
   const cfg={...ticket,quantity:count};
   const job=createPrintModeJob([asset],cfg);
   const per=job.grid!.perSheet;
   const gathered:string[]=[];
   for(let slot=0;slot<per;slot++)for(const page of job.pages){
     const placement=page.placements[slot];
     if(placement)gathered.push(placement.serial!.text);
   }
   assert.deepEqual(gathered,Array.from({length:count},(_,i)=>String(i+1).padStart(3,"0")),
     count+" uniquely ordered tickets after cutting");
 }
});
test("sequential, repeated-per-sheet and custom serial formats",()=>{
 const sequential={...ticket,numberingOrder:"sequential" as const,numberStart:70,numberIncrement:2,numberPrefix:"T-",numberSuffix:"-A",numberDigits:4};
 assert.equal(numberedTicket(sequential,0,0,10),"T-0070-A");
 assert.equal(numberedTicket(sequential,0,1,10),"T-0072-A");
 assert.equal(numberedTicket(sequential,1,0,10),"T-0090-A");
 const repeated={...sequential,numberingOrder:"repeat-sheet" as const};
 assert.equal(numberedTicket(repeated,0,1,10),"T-0070-A");
 assert.equal(numberedTicket(repeated,1,9,10),"T-0072-A");
});
test("multiple designs can be cycled or bound to cut stacks without duplicate copy keys",()=>{
 const b={...asset,id:"b",name:"Second artwork"};
 const cfg:PrintModeConfig={...ticket,quantity:20,imageAssignment:"slots",
   selectedImageId:"a",slotImageIds:["b","a","b"]};
 const job=createPrintModeJob([asset,b],cfg);
 assert.equal(job.pages[0].placements[0].itemId,"b");
 assert.equal(job.pages[1].placements[0].itemId,"b");
 assert.equal(job.pages[0].placements[1].itemId,"a");
 const keys=job.pages.flatMap(p=>p.placements.map(x=>x.itemId+"::"+x.copyIndex));
 assert.equal(new Set(keys).size,20);
 assert.equal(job.assets.reduce((sum,a)=>sum+a.quantity,0),20);
});
test("rush IDs and cards preserve physical millimeter sizes and full source images",()=>{
 const id=createPrintModeJob([asset],{...DEFAULT_PRINT_MODE,mode:"rush-id",quantity:8,idSize:"id-2x2"});
 assert.equal(id.assets[0].widthMm,50.8);assert.equal(id.assets[0].heightMm,50.8);
 const card=createPrintModeJob([asset],{...DEFAULT_PRINT_MODE,mode:"card",
   productWidthMm:90,productHeightMm:50,quantity:6});
 assert.equal(card.assets[0].widthMm,90);assert.equal(card.assets[0].heightMm,50);
 assert.equal(card.total,6);
 assert.equal(card.pages.flatMap(p=>p.placements).length,6);
});
test("notepad grids enforce A4 and generate faint guides at exact boundaries",()=>{
 const cfg={...DEFAULT_PRINT_MODE,mode:"notepad" as const,quantity:6,grid:"6" as const,marginMm:5};
 const job=createPrintModeJob([asset],cfg);
 assert.equal(job.pages.length,1);assert.equal(job.pages[0].placements.length,6);
 assert.ok(Math.abs(job.grid!.cellWidthMm-105)<1e-8);
 assert.ok(Math.abs(job.grid!.cellHeightMm-99)<1e-8);
 assert.deepEqual(job.cuts,cutGridLines(cfg));
 assert.throws(()=>createPrintModeJob([asset],{...cfg,paper:"A3"}),/requires A4/);
});
test("hard sheet limit rejects oversized batches before rendering",()=>{
 assert.throws(()=>createPrintModeJob([asset],{...ticket,grid:"2",quantity:1000}),/200 sheets/);
});
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n6sAAAAASUVORK5CYII=","base64");
test("ticket serials are embedded as individual PDF text on physically exact A4 pages",async()=>{
 const cfg={...ticket,quantity:20};
 const job=createPrintModeJob([asset],cfg);
 const labels:string[]=[];
 const original=PDFPage.prototype.drawText;
 PDFPage.prototype.drawText=function(this:PDFPage,text,opts){
   labels.push(text);
   return original.call(this,text,opts);
 };
 try{
   const pdfBlob=await exportToPdf(job.assets,job.pages,job.paper,true,
     async()=>new Blob([new Uint8Array(png)],{type:"image/png"}),
     "outline",{marginMm:5,gapMm:3},300,{notepadCuts:job.cuts,lightCutMarks:true});
   const pdf=await PDFDocument.load(await pdfBlob.arrayBuffer());
   assert.equal(pdf.getPageCount(),2);
   assert.ok(Math.abs(pdf.getPage(0).getWidth()-210*PDF_POINTS_PER_MM)<.001);
   assert.ok(Math.abs(pdf.getPage(0).getHeight()-297*PDF_POINTS_PER_MM)<.001);
   assert.equal(labels.length,20,"each cut piece must carry its own real vector serial");
   assert.equal(labels[0],"001");assert.equal(labels[1],"003");
   assert.equal(labels[10],"002");assert.equal(labels[19],"020");
 }finally{PDFPage.prototype.drawText=original;}
});

test("custom rush ID dimensions and reusable presets validate correctly",()=>{
 const config={...DEFAULT_PRINT_MODE,mode:"rush-id" as const,idSize:"id-custom",
   productWidthMm:30,productHeightMm:40,quantity:5};
 assert.ok(validPrintModeConfig(config));
 const job=createPrintModeJob([asset],config);
 assert.equal(job.assets[0].widthMm,30);
 assert.equal(job.assets[0].heightMm,40);
 assert.ok(validModePreset({id:"123",name:"Custom ID",config}));
 assert.equal(validModePreset({id:"123",name:"",config}),false);
 assert.equal(validModePreset({id:"123",name:"Broken",config:{...config,quantity:-1}}),false);
});
test("changing from ticket slot mappings to standard modes clears unsupported assignment",()=>{
 const previous={...ticket,imageAssignment:"slots" as const};
 assert.equal(modeDefaults("normal",previous).imageAssignment,"cycle");
 assert.equal(modeDefaults("notepad",previous).imageAssignment,"first");
});

test("tickets reject oversized serial labels before generating a PDF",()=>{
 assert.doesNotThrow(()=>verifyTicketLabel("001",40,30,12));
 assert.throws(()=>verifyTicketLabel("ABCDEFGHIJKLMNOPQRSTUVWXYZ",40,30,12),
   /does not fit/);
 assert.throws(()=>createPrintModeJob([asset],{...ticket,
   numberPrefix:"WWWWWWWWWWWWWWW",numberSuffix:"WWWWWWWWWWWWWWW"}),
   /does not fit/);
 assert.throws(()=>verifyTicketLabel("é",40,30,12),/Invalid ticket label/);
});
test("cycle assignment includes all imported designs even when there are more than cut slots",()=>{
 const extra=Array.from({length:13},(_,i)=>({...asset,id:"extra-"+i,name:"Design "+i}));
 const job=createPrintModeJob(extra,{...ticket,quantity:26,imageAssignment:"cycle"});
 assert.deepEqual(new Set(job.pages.flatMap(page=>page.placements.map(p=>p.itemId))),
   new Set(extra.map(a=>a.id)));
 assert.equal(job.pages[0].placements[0].itemId,"extra-0");
 assert.equal(job.pages[1].placements[0].itemId,"extra-10");
 assert.equal(job.pages[2].placements[0].itemId,"extra-7");
});
