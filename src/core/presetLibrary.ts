import type { ProjectSettings } from "./projectStore.ts";
import { validProjectSettings } from "./projectStore.ts";
export interface NamedPreset {
 id:string;name:string;updatedAt:string;settings:ProjectSettings;
 itemWidthMm:number;itemHeightMm:number;quantity:number;
}
/** Layout comparison excludes source-specific manual positions and dormant custom
 * paper dimensions. A layout is only considered applied when every image
 * matches the saved size and copy count.
 */
export function matchesNamedPreset(preset: NamedPreset, settings: ProjectSettings,
  items: ReadonlyArray<{widthMm:number;heightMm:number;quantity:number}>): boolean {
  const saved = preset.settings;
  const near = (a:number,b:number) => Number.isFinite(a) && Number.isFinite(b) &&
    Math.abs(a-b) <= 0.001;
  return items.length > 0 &&
    saved.paper === settings.paper && saved.orientation === settings.orientation &&
    (saved.paper !== "Custom" ||
      (near(saved.customWidthMm,settings.customWidthMm) &&
       near(saved.customHeightMm,settings.customHeightMm))) &&
    near(saved.marginMm,settings.marginMm) && near(saved.gapMm,settings.gapMm) &&
    saved.cutGuides === settings.cutGuides &&
    (saved.packing ?? "compact") === (settings.packing ?? "compact") &&
    (saved.pdfDpi ?? 300)===(settings.pdfDpi ?? 300) &&
    (!saved.cutGuides || (saved.trimStyle ?? "outline") === (settings.trimStyle ?? "outline")) &&
    items.every(item => near(item.widthMm,preset.itemWidthMm) &&
      near(item.heightMm,preset.itemHeightMm) && item.quantity === preset.quantity);
}

const KEY="prints:named-presets:v1";
const LEGACY="prints:sheet-preset:v1";
export function validNamedPreset(value:unknown):value is NamedPreset{
 if(!value||typeof value!=="object")return false;
 const p=value as Record<string,unknown>;
 return typeof p.id==="string"&&!!p.id&&typeof p.name==="string"&&p.name.trim().length>0&&
  p.name.length<=80&&typeof p.updatedAt==="string"&&
  validProjectSettings(p.settings)&&
  ["itemWidthMm","itemHeightMm"].every(k=>typeof p[k]==="number"&&Number.isFinite(p[k])&&
  (p[k] as number)>0&&(p[k] as number)<=2000)&&
  Number.isSafeInteger(p.quantity)&&(p.quantity as number)>=1&&(p.quantity as number)<=1000;
}
export function parsePresetLibrary(value:unknown):NamedPreset[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();
 return value.filter((p)=>{
  if(!validNamedPreset(p)||seen.has(p.id))return false;
  seen.add(p.id);return true;
 }).slice(0,40);
}
export function readPresetLibrary():NamedPreset[]{
 try{
  const raw=localStorage.getItem(KEY);
  if(raw!==null)return parsePresetLibrary(JSON.parse(raw) as unknown);
  const legacy=localStorage.getItem(LEGACY);
  if(legacy){
   const data=JSON.parse(legacy) as Record<string,unknown>;
   const migrated={id:crypto.randomUUID(),name:"Previous layout",updatedAt:new Date().toISOString(),
    settings:data.settings,itemWidthMm:data.itemWidthMm,itemHeightMm:data.itemHeightMm,
    quantity:data.quantity};
   if(validNamedPreset(migrated)){
    localStorage.setItem(KEY,JSON.stringify([migrated]));return [migrated];
   }
  }
 }catch{ /* Browser storage can be disabled. */ }
 return [];
}
export function writePresetLibrary(value:NamedPreset[]):void{
 const safe=parsePresetLibrary(value);
 if(safe.length!==value.length)throw new Error("Invalid preset library.");
 localStorage.setItem(KEY,JSON.stringify(safe));
}
