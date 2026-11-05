import {PAPER_SIZES} from "../../../core/layout.ts";

/** User-defined sheet sizes. Each job stores its own physical dimensions so
 * deleting or renaming a library entry cannot change an existing print. */
export interface CustomPaperSize { id:string; name:string; widthMm:number; heightMm:number; }
export const PAPER_LIBRARY_KEY="prints:custom-paper-sizes:v1";
export const MAX_CUSTOM_PAPERS=40;
export function validCustomPaperSize(value:unknown):value is CustomPaperSize {
 if(!value||typeof value!=="object")return false;
 const p=value as Record<string,unknown>;
 return typeof p.id==="string"&&/^[a-zA-Z0-9-]{1,100}$/.test(p.id)&&
  typeof p.name==="string"&&p.name.trim()===p.name&&p.name.length>=1&&p.name.length<=60&&
  !/[\x00-\x1f\x7f]/.test(p.name)&&
  ["widthMm","heightMm"].every(k=>typeof p[k]==="number"&&
   Number.isFinite(p[k])&&(p[k] as number)>0&&(p[k] as number)<=2000);
}
export function parsePaperLibrary(input:unknown):CustomPaperSize[]{
 if(!Array.isArray(input))return [];
 const ids=new Set<string>(),names=new Set<string>();
 return input.filter(item=>{
  if(!validCustomPaperSize(item)||ids.has(item.id)||names.has(item.name.toLocaleLowerCase()))return false;
  ids.add(item.id);names.add(item.name.toLocaleLowerCase());return true;
 }).slice(0,MAX_CUSTOM_PAPERS);
}
export function validatePaperLibrary(input:readonly CustomPaperSize[]):void {
 if(!Array.isArray(input)||input.length>MAX_CUSTOM_PAPERS||parsePaperLibrary(input).length!==input.length)
  throw new Error("Custom paper sizes require unique names, valid measurements, and at most 40 entries.");
 const seen:CustomPaperSize[]=[];
 for(const paper of input){
   // The picker resolves saved presets with samePaperSize(). Use the exact
   // same tolerance here so two entries never become indistinguishable.
   if(seen.some(other=>samePaperSize(other,paper)))
     throw new Error("A saved paper size already uses these dimensions.");
   seen.push(paper);
   if(Object.keys(PAPER_SIZES).some(k=>k.toLocaleLowerCase()===paper.name.toLocaleLowerCase()))
     throw new Error("Use a distinct name: this name is already a standard paper size.");
 }
}
export function readPaperLibrary():CustomPaperSize[]{
 try{return parsePaperLibrary(JSON.parse(localStorage.getItem(PAPER_LIBRARY_KEY)??"[]") as unknown);}
 catch{return [];}
}
export function savePaperLibrary(papers:readonly CustomPaperSize[]):void {
 validatePaperLibrary(papers);
 localStorage.setItem(PAPER_LIBRARY_KEY,JSON.stringify(papers));
}
export function samePaperSize(a:{widthMm:number;heightMm:number},b:{widthMm:number;heightMm:number}):boolean{
 return Math.abs(a.widthMm-b.widthMm)<0.0001&&Math.abs(a.heightMm-b.heightMm)<0.0001;
}
