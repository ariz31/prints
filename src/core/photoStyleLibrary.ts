import {PHOTO_CONTROLS,globalPhotoAdjustments,validPhotoAdjustments} from "./photoAdjustments.ts";
import type {PhotoAdjustments} from "./photoAdjustments.ts";

/** Small, local-only catalog; never includes a source photo, crop or retouch. */
export interface SavedPhotoStyle {
 id:string;
 name:string;
 schemaVersion:1;
 adjustments:PhotoAdjustments;
}
export const PHOTO_STYLE_STORAGE_KEY="prints:photo-styles:v1";
const MAX_STYLES=12;
export function parsePhotoStyles(input:unknown):SavedPhotoStyle[]{
 if(!Array.isArray(input))return [];
 const ids=new Set<string>(),result:SavedPhotoStyle[]=[];
 for(const raw of input){
  if(result.length>=MAX_STYLES)break;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;
  const item=raw as Record<string,unknown>;
  if(item.schemaVersion!==1||typeof item.id!=="string"||
    !/^[a-zA-Z0-9-]{1,80}$/.test(item.id)||ids.has(item.id)||
    typeof item.name!=="string"||!item.name.trim()||item.name.trim().length>50||
    !validPhotoAdjustments(item.adjustments))continue;
  const adjustments=globalPhotoAdjustments(item.adjustments);
  ids.add(item.id);
  result.push({id:item.id,name:item.name.trim(),schemaVersion:1,adjustments});
 }
 return result;
}
export function readPhotoStyles():SavedPhotoStyle[]{
 try{
  return parsePhotoStyles(JSON.parse(localStorage.getItem(PHOTO_STYLE_STORAGE_KEY)??"[]"));
 }catch{return [];}
}
export function writePhotoStyles(styles:SavedPhotoStyle[]):void {
 if(!Array.isArray(styles)||styles.length>MAX_STYLES||
   parsePhotoStyles(styles).length!==styles.length)
  throw new Error("Photo style catalog is invalid or full.");
 localStorage.setItem(PHOTO_STYLE_STORAGE_KEY,JSON.stringify(styles));
}
export function makePhotoStyle(id:string,name:string,adjustments:PhotoAdjustments):SavedPhotoStyle {
 const style={id,name:name.trim(),schemaVersion:1 as const,
  adjustments:globalPhotoAdjustments(adjustments)};
 if(parsePhotoStyles([style]).length!==1)throw new Error("Enter a valid photo style name.");
 return style;
}
export function matchingSavedPhotoStyle(adjustments:PhotoAdjustments,
 styles:readonly SavedPhotoStyle[]):SavedPhotoStyle|undefined{
 const actual=globalPhotoAdjustments(adjustments);
 return styles.find(style=>Object.keys(actual).every(key=>
   JSON.stringify(actual[key as keyof PhotoAdjustments]??0)===
   JSON.stringify(style.adjustments[key as keyof PhotoAdjustments]??0)) &&
   Object.keys(style.adjustments).every(key=>
   JSON.stringify(actual[key as keyof PhotoAdjustments]??0)===
   JSON.stringify(style.adjustments[key as keyof PhotoAdjustments]??0)));
}

/** Equal print-visible tonal looks are equal even when optional zeroes are omitted. */
export function samePhotoStyleValues(a:PhotoAdjustments,b:PhotoAdjustments):boolean {
 const left=globalPhotoAdjustments(a),right=globalPhotoAdjustments(b);
 return (Object.keys(PHOTO_CONTROLS) as Array<keyof typeof PHOTO_CONTROLS>).every(
  key=>(left[key]??0)===(right[key]??0));
}
function requireStyle(styles:readonly SavedPhotoStyle[],id:string):SavedPhotoStyle {
 const found=styles.find(style=>style.id===id);
 if(!found)throw new Error("Choose an existing saved style first.");
 return found;
}
function uniqueName(styles:readonly SavedPhotoStyle[],name:string,exceptId?:string):void {
 if(styles.some(style=>style.id!==exceptId&&
   style.name.toLowerCase()===name.toLowerCase()))
  throw new Error("A saved style already uses that name.");
}
function uniqueLook(styles:readonly SavedPhotoStyle[],candidate:PhotoAdjustments,exceptId?:string):void {
 const duplicate=styles.find(style=>style.id!==exceptId&&
   samePhotoStyleValues(style.adjustments,candidate));
 if(duplicate)throw new Error('These adjustments are already saved as "'+duplicate.name+'".');
}
export function saveNewPhotoStyle(styles:readonly SavedPhotoStyle[],id:string,name:string,
 adjustments:PhotoAdjustments):SavedPhotoStyle[] {
 if(styles.length>=MAX_STYLES)throw new Error("Style library is full (12/12). Delete a style first.");
 const next=makePhotoStyle(id,name,adjustments);
 if(styles.some(style=>style.id===id))throw new Error("Saved style identifier already exists.");
 uniqueName(styles,next.name);
 uniqueLook(styles,next.adjustments);
 return [...styles,next];
}
export function updateSavedPhotoStyle(styles:readonly SavedPhotoStyle[],id:string,
 adjustments:PhotoAdjustments):SavedPhotoStyle[] {
 const current=requireStyle(styles,id);
 const next=makePhotoStyle(current.id,current.name,adjustments);
 uniqueLook(styles,next.adjustments,id);
 return styles.map(style=>style.id===id?next:style);
}
export function renameSavedPhotoStyle(styles:readonly SavedPhotoStyle[],id:string,
 name:string):SavedPhotoStyle[] {
 const current=requireStyle(styles,id);
 const next=makePhotoStyle(current.id,name,current.adjustments);
 uniqueName(styles,next.name,id);
 return styles.map(style=>style.id===id?next:style);
}
export function removeSavedPhotoStyle(styles:readonly SavedPhotoStyle[],id:string):SavedPhotoStyle[] {
 requireStyle(styles,id);
 return styles.filter(style=>style.id!==id);
}
