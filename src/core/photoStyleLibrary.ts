import {globalPhotoAdjustments,validPhotoAdjustments} from "./photoAdjustments.ts";
import type {PhotoAdjustments} from "./photoAdjustments.ts";

/** Small, local-only catalog; never includes a source photo, crop or retouch. */
export interface SavedPhotoStyle {
 id:string;
 name:string;
 schemaVersion:1;
 adjustments:PhotoAdjustments;
}
const STORAGE_KEY="prints:photo-styles:v1";
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
  return parsePhotoStyles(JSON.parse(localStorage.getItem(STORAGE_KEY)??"[]"));
 }catch{return [];}
}
export function writePhotoStyles(styles:SavedPhotoStyle[]):void {
 if(!Array.isArray(styles)||styles.length>MAX_STYLES||
   parsePhotoStyles(styles).length!==styles.length)
  throw new Error("Photo style catalog is invalid or full.");
 localStorage.setItem(STORAGE_KEY,JSON.stringify(styles));
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
