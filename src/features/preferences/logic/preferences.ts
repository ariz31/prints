import type { ProjectSettings } from "../../../core/projectStore.ts";
import {
  DEFAULT_PREFERENCES,
  isValidPreferences,
  type UserPreferences,
} from "../../../domain/models/preferences.ts";

export {
  DEFAULT_PREFERENCES,
  isValidPreferences,
  type UserPreferences,
};
const KEY="prints:user-preferences:v1";
export function readPreferences():UserPreferences{
  try {const v=JSON.parse(localStorage.getItem(KEY)??"null") as unknown;
    return isValidPreferences(v)?{...DEFAULT_PREFERENCES,...v}:{...DEFAULT_PREFERENCES};}
  catch{return {...DEFAULT_PREFERENCES};}
}
export function savePreferences(p:UserPreferences):void{
  if(!isValidPreferences(p))throw new Error("Invalid preferences.");
  localStorage.setItem(KEY,JSON.stringify(p));
}
export function defaultPrintSettings(p:UserPreferences,custom={widthMm:p.defaultCustomWidthMm??210,heightMm:p.defaultCustomHeightMm??297}):ProjectSettings {
  return {paper:p.defaultPaper,orientation:p.defaultOrientation,
    marginMm:p.defaultMarginMm,gapMm:p.defaultGapMm,
    customWidthMm:custom.widthMm,customHeightMm:custom.heightMm,cutGuides:p.defaultCutGuides,packing:"compact",copyMode:"automatic"};
}
