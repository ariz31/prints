import {validPrintModeConfig} from "./printModes.ts";
import type {PrintModeConfig} from "./printModes.ts";

export interface SavedPrintMode {
 id:string;
 name:string;
 config:PrintModeConfig;
}
const KEY="prints:print-mode-presets:v1";
export function validModePreset(value:unknown):value is SavedPrintMode{
 if(!value||typeof value!=="object")return false;
 const p=value as Record<string,unknown>;
 return typeof p.id==="string"&&p.id.length>0&&p.id.length<=100&&
   typeof p.name==="string"&&p.name.trim().length>0&&p.name.length<=80&&
   validPrintModeConfig(p.config);
}
export function readModePresets():SavedPrintMode[]{
 try{
   const saved=JSON.parse(localStorage.getItem(KEY)??"[]") as unknown;
   return Array.isArray(saved)?saved.filter(validModePreset).slice(0,40):[];
 }catch{return [];}
}
export function saveModePresets(presets:readonly SavedPrintMode[]):void{
 if(presets.length>40||presets.some(p=>!validModePreset(p)))
   throw new Error("Invalid print-mode preset.");
 localStorage.setItem(KEY,JSON.stringify(presets));
}
