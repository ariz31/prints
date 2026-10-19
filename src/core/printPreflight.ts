import { exactCropSourceRect } from "./crop.ts";
import { rasterDimensions } from "./imageRaster.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import type { SheetPage } from "./layout.ts";
import { validDesignLayers } from "./layers.ts";
import { validateCornerMarkClearance } from "./cutMarks.ts";
import type { TrimStyle } from "./cutMarks.ts";

export type PreflightSeverity="error"|"warning";
export interface PreflightIssue {
  severity:PreflightSeverity;
  code:string;
  title:string;
  detail:string;
  assetId?:string;
}
export interface PreflightReport {
  errors:PreflightIssue[];
  warnings:PreflightIssue[];
  totalCopies:number;
  sheetCount:number;
  lowestDpi:number|null;
}
const winAnsiExtra=/[€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/u;
/** Conservative PDF Standard Helvetica glyph gate, not a font-shaping system. */
export function unsupportedPdfText(input:string):boolean {
  for(const ch of input){
    const cp=ch.codePointAt(0)!;
    if(ch==="\n"|| (cp>=32 && cp<=126) || (cp>=160&&cp<=255) ||
      winAnsiExtra.test(ch))continue;
    return true;
  }
  return false;
}
/** Same normalized source crop and raster limits used by preview/PDF export. */
export function assessPrintJob(
 assets:ReadonlyArray<PhotoAsset>,pages:ReadonlyArray<SheetPage>,
 paper:{widthMm:number;heightMm:number},
 trim?:{cutGuides:boolean;trimStyle?:TrimStyle;marginMm:number;gapMm:number},
):PreflightReport {
 const errors:PreflightIssue[]=[];
 const warnings:PreflightIssue[]=[];
 const issue=(severity:PreflightSeverity,code:string,title:string,detail:string,assetId?:string)=>{
   (severity==="error"?errors:warnings).push({severity,code,title,detail,assetId});
 };
 const copies=assets.reduce((total,a)=>total+(Number.isSafeInteger(a.quantity)?a.quantity:0),0);
 if(!assets.length){
   issue("error","no-images","Add an image","Import a JPG, PNG or WebP to create a print job.");
 }else if(!pages.length){
   issue("error","no-sheets","No printable sheets","Check item sizes, quantities and paper margins.");
 }
 if(!Number.isFinite(paper.widthMm)||!Number.isFinite(paper.heightMm)||
   paper.widthMm<=0||paper.heightMm<=0)
   issue("error","paper","Invalid paper dimensions","Select a valid paper size.");
 if(trim?.cutGuides && trim.trimStyle==="corner"){
   try{validateCornerMarkClearance(trim.marginMm,trim.gapMm);}
   catch{issue("error","cut-clearance","Cut marks need more space",
     "Corner marks require at least 1.5 mm paper margins and 3 mm between items.");}
 }
 if(pages.length>200)
   issue("error","too-many-sheets","Too many sheets","Split the job into batches of at most 200 sheets.");
 let lowestDpi:number|null=null;
 let estimatedPixels=0;
 for(const asset of assets){
   const label=asset.name||"Unnamed image";
   if(!Number.isFinite(asset.widthMm)||!Number.isFinite(asset.heightMm)||
     asset.widthMm<=0||asset.heightMm<=0){
     issue("error","dimensions","Invalid image size",label+": enter a valid print width and height.",asset.id);
     continue;
   }
   try {
     const rect=exactCropSourceRect(asset.processedWidth??asset.pixelWidth,
       asset.processedHeight??asset.pixelHeight,asset.crop,asset.widthMm,asset.heightMm);
     const dpi=Math.floor(Math.min(rect.sw/(asset.widthMm/25.4),
       rect.sh/(asset.heightMm/25.4)));
     lowestDpi=lowestDpi===null?dpi:Math.min(lowestDpi,dpi);
     if(dpi<150)issue("warning","low-resolution","Low image resolution",
       label+": "+dpi+" effective DPI. Small text or photos may look soft.",asset.id);
     else if(dpi<240)issue("warning","moderate-resolution","Check image sharpness",
       label+": "+dpi+" effective DPI. Inspect at print size.",asset.id);
     const dims=rasterDimensions(asset.widthMm,asset.heightMm,300);
     estimatedPixels+=dims.width*dims.height;
   }catch {
     issue("error","crop","Crop needs review",
       label+": open Crop to fit the fixed frame to its physical print size.",asset.id);
   }
   if(asset.layers!==undefined&&!validDesignLayers(asset.layers)){
     issue("error","layers","Invalid design layers",
       label+": a text or shape layer is outside its printable area.",asset.id);
     continue;
   }
   if(asset.layers?.some(layer=>layer.visible&&layer.kind==="text"&&
     unsupportedPdfText(layer.text))){
     issue("error","unsupported-text","Unsupported PDF characters",
       label+": standard Helvetica cannot encode some characters. Replace them before PDF export.",asset.id);
   }
 }
 if(estimatedPixels>120_000_000)
   issue("error","raster-memory","Export memory limit",
     "Reduce the number or size of image designs in this print batch.");
 if(pages.length>30)
   issue("warning","large-batch","Large print job",
     pages.length+" sheets. Consider exporting in smaller batches for easier checking.");
 return {errors,warnings,totalCopies:copies,sheetCount:pages.length,lowestDpi};
}
