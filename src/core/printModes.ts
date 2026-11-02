import {fitCropToAspect} from "./crop.ts";
import {ID_SIZES} from "./idPhoto.ts";
import {PAPER_SIZES,getPaperDimensions,composeSheets} from "./layout.ts";
import type {Orientation,PaperName,Placement,SheetPage} from "./layout.ts";
import {NOTEPAD_PRESETS} from "./notepadLayout.ts";
import type {NotepadPresetId} from "./notepadLayout.ts";
import type {TrimLine} from "./cutMarks.ts";
import type {PhotoAsset} from "./exportPdf.ts";

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
export type ImageAssignment="first"|"cycle"|"slots";
export interface PrintModeConfig {
 mode:PrintModeId;
 paper:Exclude<PaperName,"Custom">;
 orientation:Orientation;
 quantity:number;
 marginMm:number;
 gapMm:number;
 cutGuides:boolean;
 dpi:300|600;
 grid:NotepadPresetId;
 idSize:string;
 productWidthMm:number;
 productHeightMm:number;
 imageAssignment:ImageAssignment;
 selectedImageId:string;
 slotImageIds:string[];
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
 mode:"normal",paper:"A4",orientation:"portrait",quantity:1,marginMm:5,gapMm:3,
 cutGuides:true,dpi:300,grid:"10",idSize:"id-2x2",productWidthMm:50,
 productHeightMm:30,imageAssignment:"first",selectedImageId:"",slotImageIds:[],
 numberingOrder:"cut-stack",numberStart:1,numberIncrement:1,numberDigits:3,
 numberPrefix:"",numberSuffix:"",numberX:50,numberY:84,numberFontPt:12,
};
const MODES=new Set<string>(PRINT_MODES.map(m=>m.id));
const GRIDS=new Set<string>(NOTEPAD_PRESETS.map(m=>m.id));
const PAPERS=new Set<string>(Object.keys(PAPER_SIZES));
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const decimal=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const safeText=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max&&/^[\x20-\x7e]*$/.test(v);
export function validPrintModeConfig(value:unknown):value is PrintModeConfig{
 if(!value||typeof value!=="object")return false;
 const v=value as Record<string,unknown>;
 return MODES.has(String(v.mode))&&PAPERS.has(String(v.paper))&&
  ["portrait","landscape"].includes(String(v.orientation))&&integer(v.quantity,1,1000)&&
  decimal(v.marginMm,0,40)&&decimal(v.gapMm,0,30)&&typeof v.cutGuides==="boolean"&&
  (v.dpi===300||v.dpi===600)&&GRIDS.has(String(v.grid))&&
  typeof v.idSize==="string"&&(v.idSize==="id-custom"||ID_SIZES.some(s=>s.id===v.idSize))&&
  decimal(v.productWidthMm,10,200)&&decimal(v.productHeightMm,10,200)&&
  ["first","cycle","slots"].includes(String(v.imageAssignment))&&
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
  imageAssignment:mode==="notepad"?"first":mode!=="ticket"&&old.imageAssignment==="slots"?"cycle":old.imageAssignment,
  grid:mode==="ticket"?"10":mode==="notepad"?"4":old.grid,
  ...((mode==="notepad")?{paper:"A4" as const}:{}),
  productWidthMm:mode==="card"?90:mode==="sticker"?50:old.productWidthMm,
  productHeightMm:mode==="card"?50:mode==="sticker"?30:old.productHeightMm};
}
export interface CutGeometry {
 columns:number;rows:number;perSheet:number;cellWidthMm:number;cellHeightMm:number;
 artWidthMm:number;artHeightMm:number;
}
export function getCutGeometry(config:PrintModeConfig):CutGeometry {
 if(!validPrintModeConfig(config))throw new Error("Invalid print mode settings.");
 const paper=getPaperDimensions(config.paper,config.orientation);
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
 const paper=getPaperDimensions(config.paper,config.orientation);
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
export interface PrintModeJob {
 assets:PhotoAsset[];
 pages:SheetPage[];
 paper:{widthMm:number;heightMm:number};
 cuts?:TrimLine[];
 grid?:CutGeometry;
 total:number;
}
export function createPrintModeJob(source:readonly PhotoAsset[],config:PrintModeConfig):PrintModeJob{
 if(!validPrintModeConfig(config))throw new Error("Print mode settings are incomplete or invalid.");
 if(source.length>25||new Set(source.map(a=>a.id)).size!==source.length)
  throw new Error("Import up to 25 unique source images.");
 const paper=getPaperDimensions(config.paper,config.orientation);
 if(!source.length)return {assets:[],pages:[],paper,total:0};
 const first=source.find(a=>a.id===config.selectedImageId)??source[0];
 // Use current editable artwork but never mutate the saved design's crop/size/copies.
 const sized=(asset:PhotoAsset,widthMm:number,heightMm:number,quantity:number):PhotoAsset=>({
   ...asset,widthMm,heightMm,quantity,
   crop:fitCropToAspect(asset.crop,asset.processedWidth??asset.pixelWidth,
     asset.processedHeight??asset.pixelHeight,widthMm,heightMm),
 });
 const gridded=config.mode==="ticket"||config.mode==="notepad";
 if(gridded){
   if(config.mode==="notepad"&&config.paper!=="A4")
     throw new Error("Notepad cutting requires A4 paper.");
   const g=getCutGeometry(config);
   const sheets=Math.ceil(config.quantity/g.perSheet);
   if(sheets>200)throw new Error("Split this job into batches of at most 200 sheets.");
   const assets:PhotoAsset[]=[];
   const byId=new Map<string,PhotoAsset>();
   const usage=new Map<string,number>();
   const pages:SheetPage[]=[];
   const pick=(slot:number):PhotoAsset=>{
     if(config.mode==="notepad"||config.imageAssignment==="first")return first;
     if(config.imageAssignment==="cycle")return source[slot%source.length];
     const id=config.slotImageIds[slot];
     return source.find(a=>a.id===id)??first;
   };
   for(let sheet=0;sheet<sheets;sheet++){
     const placements:Placement[]=[];
     for(let slot=0;slot<g.perSheet;slot++){
       // A partly filled final sheet still stacks into uninterrupted ranges.
       const index=sheet*g.perSheet+slot;
       if(index>=config.quantity)continue;
       const item=pick(slot);
       if(!byId.has(item.id)){
         const printed=sized(item,g.artWidthMm,g.artHeightMm,1);
         byId.set(item.id,printed);
         assets.push(printed);
       }
       const copyIndex=usage.get(item.id)??0;
       usage.set(item.id,copyIndex+1);
       placements.push({
         itemId:item.id,copyIndex,xMm:(slot%g.columns)*g.cellWidthMm+config.marginMm,
         yMm:Math.floor(slot/g.columns)*g.cellHeightMm+config.marginMm,
         widthMm:g.artWidthMm,heightMm:g.artHeightMm,
         ...(config.mode==="ticket"?{serial:{
           text:numberedTicket(config,sheet,slot,sheets),
           xPercent:config.numberX,yPercent:config.numberY,
           fontSizePt:config.numberFontPt,
         }}:{}),
       });
     }
     pages.push({placements});
   }
   for(const a of assets)a.quantity=usage.get(a.id)??1;
   return {assets,pages,paper,cuts:cutGridLines(config),grid:g,total:config.quantity};
 }
 let size:{widthMm:number;heightMm:number};
 if(config.mode==="rush-id"){
   const id=ID_SIZES.find(s=>s.id===config.idSize);
   size=id?{widthMm:id.widthMm,heightMm:id.heightMm}:
     {widthMm:config.productWidthMm,heightMm:config.productHeightMm};
 }else if(config.mode==="sticker"||config.mode==="card"){
   size={widthMm:config.productWidthMm,heightMm:config.productHeightMm};
 }else{
   // Normal mode respects each design's actual physical size.
   size={widthMm:0,heightMm:0};
 }
 const selected=config.imageAssignment==="first"?[first]:source;
 const base=Math.floor(config.quantity/selected.length),extra=config.quantity%selected.length;
 const prepared=selected.map((a,i)=>sized(a,size.widthMm||a.widthMm,
   size.heightMm||a.heightMm,base+(i<extra?1:0))).filter(a=>a.quantity>0);
 const pages=composeSheets(prepared.map(a=>({
   id:a.id,widthMm:a.widthMm,heightMm:a.heightMm,quantity:a.quantity,
   canRotate:false,
 })),{paperWidthMm:paper.widthMm,paperHeightMm:paper.heightMm,
   marginMm:config.marginMm,gapMm:config.gapMm,packing:"ordered"});
 return {assets:prepared,pages,paper,total:config.quantity};
}
