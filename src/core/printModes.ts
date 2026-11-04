import {validExportDpi} from "./dpi.ts";
import {fitCropToAspect} from "./crop.ts";
import {ID_SIZES} from "./idPhoto.ts";
import {getPaperDimensions,composeSheets,isPaperName} from "./layout.ts";
import type {Orientation,PaperName,Placement,SheetPage} from "./layout.ts";
import {NOTEPAD_PRESETS} from "./notepadLayout.ts";
import type {NotepadPresetId} from "./notepadLayout.ts";
import type {TrimLine} from "./cutMarks.ts";
import type {PhotoAsset} from "./exportPdf.ts";
import {resolveModeImageAssignments} from "./printModeAssignments.ts";

export const PRINT_MODES = [
 {id:"normal",label:"Normal Print",description:"Photos and documents, fitted to paper",icon:"image"},
 {id:"notepad",label:"Notepad Cut",description:"Exact equal-cut sheet grids",icon:"grid"},
 {id:"ticket",label:"Ticket Cut",description:"Serials and cut-and-stack sheets",icon:"ticket"},
 {id:"rush-id",label:"Rush ID Cut",description:"1 × 1, 2 × 2 and passport photos",icon:"id"},
 {id:"sticker",label:"Sticker & Label Cut",description:"Repeated custom-sized stickers",icon:"sticker"},
 {id:"card",label:"Business Card Cut",description:"Standard/custom-size cards",icon:"card"},
] as const;
export type PrintModeId=(typeof PRINT_MODES)[number]["id"];
export type NumberingOrder="cut-stack"|"sequential"|"repeat-sheet";
export type ImageAssignment="first"|"cycle"|"selected"|"slots";
export type ModeQuantityBasis="total"|"per-design";
export interface PrintModeConfig {
 mode:PrintModeId;
 paper:PaperName;
 /** Legacy saved modes omit these fields. Custom mode requires both. */
 customWidthMm?:number;
 customHeightMm?:number;
 orientation:Orientation;
 quantity:number;
 marginMm:number;
 gapMm:number;
 cutGuides:boolean;
 dpi:number;
 grid:NotepadPresetId;
 idSize:string;
 productWidthMm:number;
 productHeightMm:number;
 imageAssignment:ImageAssignment;
 selectedImageId:string;
 slotImageIds:string[];
 /** Absent in older jobs: retain their original finished-pieces semantics. */
 quantityBasis?:ModeQuantityBasis;
 /** Used only in explicitly selected-design mode; stable source IDs, never indexes. */
 includedImageIds?:string[];
 /** Explicit count per design, with one copy for newly imported IDs by default. */
 perImageQuantities?:Record<string,number>;
 numberingOrder:NumberingOrder;
 numberStart:number;
 numberIncrement:number;
 numberDigits:number;
 numberPrefix:string;
 numberSuffix:string;
 numberX:number;
 numberY:number;
 numberFontPt:number;
}
export const DEFAULT_PRINT_MODE:PrintModeConfig={
 mode:"normal",paper:"A4",customWidthMm:210,customHeightMm:297,orientation:"portrait",quantity:1,marginMm:5,gapMm:3,
 cutGuides:true,dpi:300,grid:"10",idSize:"id-2x2",productWidthMm:50,
 productHeightMm:30,imageAssignment:"first",selectedImageId:"",slotImageIds:[],
 numberingOrder:"cut-stack",numberStart:1,numberIncrement:1,numberDigits:3,
 numberPrefix:"",numberSuffix:"",numberX:50,numberY:84,numberFontPt:12,
};
const MODES=new Set<string>(PRINT_MODES.map(m=>m.id));
const GRIDS=new Set<string>(NOTEPAD_PRESETS.map(m=>m.id));
/** Use the physical dimensions saved in the job, not a mutable library lookup. */
export function getModePaperDimensions(config:Pick<PrintModeConfig,"paper"|"orientation"|"customWidthMm"|"customHeightMm">){
 return getPaperDimensions(config.paper,config.orientation,{
   widthMm:config.customWidthMm??210,heightMm:config.customHeightMm??297,
 });
}
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const decimal=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const safeText=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max&&/^[\x20-\x7e]*$/.test(v);
export function validPrintModeConfig(value:unknown):value is PrintModeConfig{
 if(!value||typeof value!=="object")return false;
 const v=value as Record<string,unknown>;
 return MODES.has(String(v.mode))&&isPaperName(v.paper)&&
  ["customWidthMm","customHeightMm"].every(k=>v[k]===undefined || decimal(v[k],0.000001,2000))&&
  (v.paper!=="Custom" || (decimal(v.customWidthMm,0.000001,2000)&&decimal(v.customHeightMm,0.000001,2000)))&&
  ["portrait","landscape"].includes(String(v.orientation))&&integer(v.quantity,1,1000)&&
  decimal(v.marginMm,0,40)&&decimal(v.gapMm,0,30)&&typeof v.cutGuides==="boolean"&&
  validExportDpi(v.dpi)&&GRIDS.has(String(v.grid))&&
  typeof v.idSize==="string"&&(v.idSize==="id-custom"||ID_SIZES.some(s=>s.id===v.idSize))&&
  decimal(v.productWidthMm,10,200)&&decimal(v.productHeightMm,10,200)&&
  ["first","cycle","selected","slots"].includes(String(v.imageAssignment))&&
  (v.quantityBasis===undefined||v.quantityBasis==="total"||v.quantityBasis==="per-design")&&
  (v.imageAssignment!=="slots"||v.quantityBasis!=="per-design")&&
  (v.imageAssignment!=="selected"||Array.isArray(v.includedImageIds))&&
  (v.includedImageIds===undefined||
    (Array.isArray(v.includedImageIds)&&v.includedImageIds.length<=25&&
     v.includedImageIds.every(id=>typeof id==="string"&&id.trim().length>0&&id.length<=200)&&
     new Set(v.includedImageIds).size===v.includedImageIds.length))&&
  (v.perImageQuantities===undefined||
    (v.perImageQuantities!==null&&typeof v.perImageQuantities==="object"&&!Array.isArray(v.perImageQuantities)&&
     Object.keys(v.perImageQuantities).length<=25&&
     Object.entries(v.perImageQuantities).every(([id,q])=>id.trim().length>0&&id.length<=200&&integer(q,1,1000))))&&
  typeof v.selectedImageId==="string"&&v.selectedImageId.length<=200&&
  Array.isArray(v.slotImageIds)&&v.slotImageIds.length<=20&&
  v.slotImageIds.every(s=>typeof s==="string"&&s.length<=200)&&
  ["cut-stack","sequential","repeat-sheet"].includes(String(v.numberingOrder))&&
  integer(v.numberStart,0,99999999)&&integer(v.numberIncrement,1,100000)&&
  integer(v.numberDigits,1,10)&&safeText(v.numberPrefix,15)&&safeText(v.numberSuffix,15)&&
  decimal(v.numberX,0,100)&&decimal(v.numberY,0,100)&&
  decimal(v.numberFontPt,5,30);
}
export function modeDefaults(mode:PrintModeId,old:PrintModeConfig):PrintModeConfig{
 return {...old,mode,quantity:mode==="ticket"?100:mode==="normal"?1:mode==="rush-id"?8:12,
  imageAssignment:mode==="notepad"&&(old.quantityBasis===undefined||old.imageAssignment==="slots")?"first":mode!=="ticket"&&old.imageAssignment==="slots"?"cycle":old.imageAssignment,
  grid:mode==="ticket"?"10":mode==="notepad"?"4":old.grid,
  productWidthMm:mode==="card"?90:mode==="sticker"?50:old.productWidthMm,
  productHeightMm:mode==="card"?50:mode==="sticker"?30:old.productHeightMm};
}
export interface CutGeometry {
 columns:number;rows:number;perSheet:number;cellWidthMm:number;cellHeightMm:number;
 artWidthMm:number;artHeightMm:number;
}
export function getCutGeometry(config:PrintModeConfig):CutGeometry {
 if(!validPrintModeConfig(config))throw new Error("Invalid print mode settings.");
 const paper=getModePaperDimensions(config);
 const preset=NOTEPAD_PRESETS.find(p=>p.id===config.grid)!;
 const columns=config.orientation==="portrait"?preset.columns:preset.rows;
 const rows=config.orientation==="portrait"?preset.rows:preset.columns;
 const cellWidthMm=paper.widthMm/columns,cellHeightMm=paper.heightMm/rows;
 const artWidthMm=cellWidthMm-2*config.marginMm,artHeightMm=cellHeightMm-2*config.marginMm;
 if(artWidthMm<=0||artHeightMm<=0)
  throw new Error("Artwork inset is too large for this cutting grid.");
 return {columns,rows,perSheet:columns*rows,cellWidthMm,cellHeightMm,artWidthMm,artHeightMm};
}
export function cutGridLines(config:PrintModeConfig):TrimLine[]{
 const paper=getModePaperDimensions(config);
 const g=getCutGeometry(config);
 const lines:TrimLine[]=[];
 for(let col=1;col<g.columns;col++)lines.push({
   x1:col*g.cellWidthMm,y1:config.marginMm,
   x2:col*g.cellWidthMm,y2:paper.heightMm-config.marginMm});
 for(let row=1;row<g.rows;row++)lines.push({
   x1:config.marginMm,y1:row*g.cellHeightMm,
   x2:paper.widthMm-config.marginMm,y2:row*g.cellHeightMm});
 return lines;
}
export function numberedTicket(config:PrintModeConfig,sheet:number,slot:number,sheets:number):string{
 if(!integer(sheet,0,199)||!integer(slot,0,19)||!integer(sheets,1,200))
  throw new Error("Invalid ticket sequence location.");
 // Uneven batches must not skip numbers after stacking unequal-height cuts.
 const perSheet=Number(config.grid);
 const full=Math.floor(config.quantity/perSheet);
 const remainder=config.quantity%perSheet;
 const cutStackOffset=slot*full+Math.min(slot,remainder);
 const serialIndex=config.numberingOrder==="cut-stack"?cutStackOffset+sheet:
  config.numberingOrder==="repeat-sheet"?sheet:sheet*perSheet+slot;
 const value=config.numberStart+serialIndex*config.numberIncrement;
 if(!Number.isSafeInteger(value)||value>9999999999)throw new Error("Ticket serial number exceeds the supported range.");
 return config.numberPrefix+String(value).padStart(config.numberDigits,"0")+config.numberSuffix;
}
/** Helvetica-Bold's standard-font advance widths (1000 UPM) for the typical
 * ASCII serial alphabet. Unlisted printable glyphs use a conservative
 * one-em upper bound. PDF export independently measures the actual font. */
const SERIAL_WIDTHS:Record<string,number>={
 " ":278,"-":333,".":278,"/":278,":":333,"_":556,
 "0":556,"1":556,"2":556,"3":556,"4":556,"5":556,"6":556,"7":556,"8":556,"9":556,
 "A":722,"B":722,"C":722,"D":722,"E":667,"F":611,"G":778,"H":722,
 "I":278,"J":556,"K":722,"L":611,"M":833,"N":722,"O":778,"P":667,
 "Q":778,"R":722,"S":667,"T":611,"U":722,"V":667,"W":944,"X":667,
 "Y":667,"Z":611,
 "a":556,"b":611,"c":556,"d":611,"e":556,"f":333,"g":611,"h":611,
 "i":278,"j":278,"k":556,"l":278,"m":889,"n":611,"o":611,"p":611,
 "q":611,"r":389,"s":556,"t":333,"u":611,"v":556,"w":833,"x":556,
 "y":556,"z":500,
};
export function verifyTicketLabel(text:string,widthMm:number,heightMm:number,fontSizePt:number):void{
 if(typeof text!=="string"||!text||text.length>45||!/^[\x20-\x7e]+$/.test(text)||
   ![widthMm,heightMm,fontSizePt].every(Number.isFinite)||widthMm<=0||
   heightMm<=0||fontSizePt<5||fontSizePt>30)
   throw new Error("Invalid ticket label or cutting dimensions.");
 const printableWidthPt=widthMm*72/25.4-2*72/25.4;
 const printableHeightPt=heightMm*72/25.4-2*72/25.4;
 const widthPt=[...text].reduce((sum,ch)=>sum+(SERIAL_WIDTHS[ch]??1000),0)*fontSizePt/1000;
 if(widthPt>printableWidthPt||fontSizePt>printableHeightPt)
   throw new Error("Ticket serial does not fit the cut piece. Reduce the font size, prefix or suffix.");
}
export interface PrintModeJob {
 assets:PhotoAsset[];
 pages:SheetPage[];
 paper:{widthMm:number;heightMm:number};
 cuts?:TrimLine[];
 grid?:CutGeometry;
 total:number;
}
export function createPrintModeJob(source:readonly PhotoAsset[],config:PrintModeConfig):PrintModeJob{
 if(!validPrintModeConfig(config))throw new Error("Invalid print mode settings.");
 if(source.length>25||new Set(source.map(a=>a.id)).size!==source.length||
   source.some(a=>typeof a.id!=="string"||!a.id.trim()||a.id.length>200))
  throw new Error("Import up to 25 uniquely identified source images.");
 const paper=getModePaperDimensions(config);
 if(!source.length)return {assets:[],pages:[],paper,total:0};
 const selection=resolveModeImageAssignments(source,config);
 const count=selection.total;
 if(count>1000)throw new Error("This print job exceeds 1,000 finished pieces.");
 if(!count)throw new Error("Select at least one image for this print job.");
 const first=config.selectedImageId?source.find(a=>a.id===config.selectedImageId)??source[0]:source[0];
 // Preserve source artwork: job-specific crops, dimensions and quantities are copies.
 const sized=(asset:PhotoAsset,widthMm:number,heightMm:number,quantity:number):PhotoAsset=>({
   ...asset,widthMm,heightMm,quantity,
   crop:fitCropToAspect(asset.crop,asset.processedWidth??asset.pixelWidth,
     asset.processedHeight??asset.pixelHeight,widthMm,heightMm),
 });
 const gridded=config.mode==="ticket"||config.mode==="notepad";
 if(gridded){
   const g=getCutGeometry(config);
   // Notepad cutting is one source design per PHYSICAL sheet: a partially
   // filled design never shares cutting cells with the next design.
   const batches=config.mode==="notepad"&&config.quantityBasis==="per-design"
     ?selection.selected.map(asset=>({asset,copies:selection.quantities.get(asset.id)??0}))
       .filter(batch=>batch.copies>0)
     :null;
   const sheets=batches
     ?batches.reduce((n,batch)=>n+Math.ceil(batch.copies/g.perSheet),0)
     :Math.ceil(count/g.perSheet);
   if(sheets>200)throw new Error("Split this job into batches of at most 200 sheets.");
   const assets:PhotoAsset[]=[];
   const byId=new Map<string,PhotoAsset>();
   const usage=new Map<string,number>();
   const pages:SheetPage[]=[];
   const numberedConfig={...config,quantity:count};
   const place=(item:PhotoAsset,slot:number,sheet:number)=>{
     if(!byId.has(item.id)){
       const printed=sized(item,g.artWidthMm,g.artHeightMm,1);
       byId.set(item.id,printed);
       assets.push(printed);
     }
     const copyIndex=usage.get(item.id)??0;
     usage.set(item.id,copyIndex+1);
     if(config.mode==="ticket")
       verifyTicketLabel(numberedTicket(numberedConfig,sheet,slot,sheets),
         g.artWidthMm,g.artHeightMm,config.numberFontPt);
     return {
       itemId:item.id,copyIndex,xMm:(slot%g.columns)*g.cellWidthMm+config.marginMm,
       yMm:Math.floor(slot/g.columns)*g.cellHeightMm+config.marginMm,
       widthMm:g.artWidthMm,heightMm:g.artHeightMm,
       ...(config.mode==="ticket"?{serial:{
         text:numberedTicket(numberedConfig,sheet,slot,sheets),
         xPercent:config.numberX,yPercent:config.numberY,
         fontSizePt:config.numberFontPt,
       }}:{}),
     } as Placement;
   };
   if(batches){
     let page=0;
     for(const batch of batches)for(let offset=0;offset<batch.copies;offset+=g.perSheet){
       const placements:Placement[]=[];
       for(let slot=0;slot<Math.min(g.perSheet,batch.copies-offset);slot++)
         placements.push(place(batch.asset,slot,page));
       pages.push({placements});page++;
     }
   }else{
     for(let sheet=0;sheet<sheets;sheet++){
       const placements:Placement[]=[];
       const selectedSheetItem=config.mode==="notepad"
         ?selection.sequence[sheet%selection.sequence.length]
         :undefined;
       for(let slot=0;slot<g.perSheet;slot++){
         const index=sheet*g.perSheet+slot;
         if(index>=count)continue;
         let item:PhotoAsset;
         if(config.mode==="notepad")item=selectedSheetItem??first;
         else if(config.imageAssignment==="slots"){
           const id=config.slotImageIds[slot];
           item=id?(source.find(a=>a.id===id)??first):first;
           if(id&&!source.some(a=>a.id===id))
             throw new Error("Ticket position "+(slot+1)+
               " references an unavailable image. Reassign that position on the Images tab.");
         }else item=selection.sequence[index]??first;
         placements.push(place(item,slot,sheet));
       }
       pages.push({placements});
     }
   }
   for(const item of assets)item.quantity=usage.get(item.id)??1;
   return {assets,pages,paper,cuts:cutGridLines(config),grid:g,total:count};
 }
 let size:{widthMm:number;heightMm:number};
 if(config.mode==="rush-id"){
   const id=ID_SIZES.find(s=>s.id===config.idSize);
   size=id?{widthMm:id.widthMm,heightMm:id.heightMm}:
     {widthMm:config.productWidthMm,heightMm:config.productHeightMm};
 }else if(config.mode==="sticker"||config.mode==="card"){
   size={widthMm:config.productWidthMm,heightMm:config.productHeightMm};
 }else size={widthMm:0,heightMm:0};
 const prepared=selection.selected.map(a=>sized(a,size.widthMm||a.widthMm,
   size.heightMm||a.heightMm,selection.quantities.get(a.id)??0))
   .filter(a=>a.quantity>0);
 const layout={paperWidthMm:paper.widthMm,paperHeightMm:paper.heightMm,
   marginMm:config.marginMm,gapMm:config.gapMm,packing:"ordered" as const};
 if(config.imageAssignment==="first"){
   const pages=composeSheets(prepared.map(a=>({
     id:a.id,widthMm:a.widthMm,heightMm:a.heightMm,quantity:a.quantity,canRotate:false,
   })),layout);
   return {assets:prepared,pages,paper,total:count};
 }
 // One virtual print instance per output position preserves round-robin order
 // with uneven copy counts and mixed dimensions. Export rasterizes each source once.
 const virtual=selection.sequence.map((item,position)=>({
   id:"print-slot-"+position,widthMm:size.widthMm||item.widthMm,
   heightMm:size.heightMm||item.heightMm,quantity:1,canRotate:false,
 }));
 const usage=new Map<string,number>();
 const virtualLookup=new Map(virtual.map((v,index)=>[v.id,selection.sequence[index].id]));
 const pages=composeSheets(virtual,layout).map(page=>({placements:page.placements.map(p=>{
   const id=virtualLookup.get(p.itemId)!;
   const copyIndex=usage.get(id)??0;
   usage.set(id,copyIndex+1);
   return {...p,itemId:id,copyIndex};
 })}));
 return {assets:prepared,pages,paper,total:count};
}
