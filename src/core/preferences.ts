import type { DisplayUnit } from "./units.ts";
import type { ProjectSettings } from "./projectStore.ts";
export interface UserPreferences{
  unit:DisplayUnit;defaultPaper:ProjectSettings["paper"];defaultOrientation:ProjectSettings["orientation"];
  defaultMarginMm:number;defaultGapMm:number;defaultCutGuides:boolean;autoSave?:boolean;
}
const KEY="prints:user-preferences:v1";
export const DEFAULT_PREFERENCES:UserPreferences={
  unit:"mm",defaultPaper:"A4",defaultOrientation:"portrait",
  defaultMarginMm:5,defaultGapMm:3,defaultCutGuides:true,autoSave:true,
};
export function isValidPreferences(v:unknown):v is UserPreferences{
  if(!v||typeof v!=="object")return false;
  const p=v as Record<string,unknown>;
  return ["mm","cm","in"].includes(String(p.unit)) &&
    ["A4","A3","Letter","Legal","Long Bond","Custom"].includes(String(p.defaultPaper)) &&
    ["portrait","landscape"].includes(String(p.defaultOrientation)) &&
    typeof p.defaultCutGuides==="boolean" &&
    (p.autoSave===undefined||typeof p.autoSave==="boolean") &&
    ["defaultMarginMm","defaultGapMm"].every(k=>typeof p[k]==="number" &&
      Number.isFinite(p[k])&&(p[k] as number)>=0&&(p[k] as number)<200);
}
export function readPreferences():UserPreferences{
  try {const v=JSON.parse(localStorage.getItem(KEY)??"null") as unknown;
    return isValidPreferences(v)?{...DEFAULT_PREFERENCES,...v}:{...DEFAULT_PREFERENCES};}
  catch{return {...DEFAULT_PREFERENCES};}
}
export function savePreferences(p:UserPreferences):void{
  if(!isValidPreferences(p))throw new Error("Invalid preferences.");
  localStorage.setItem(KEY,JSON.stringify(p));
}
export function defaultPrintSettings(p:UserPreferences,custom={widthMm:210,heightMm:297}):ProjectSettings {
  return {paper:p.defaultPaper,orientation:p.defaultOrientation,
    marginMm:p.defaultMarginMm,gapMm:p.defaultGapMm,
    customWidthMm:custom.widthMm,customHeightMm:custom.heightMm,cutGuides:p.defaultCutGuides,packing:"compact"};
}
