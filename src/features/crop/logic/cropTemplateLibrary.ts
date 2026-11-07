import type {CropRegion,CropShape,ShapePoint} from "../../../domain/models/crop.ts";
import {validCropShape} from "../../../domain/models/crop.ts";
import {validCropRegion,validCustomPolygon} from "./studioGeometry.ts";
import type {CropStudioDocument} from "./studioDocument.ts";
import {validCropStudioDocument} from "./studioDocument.ts";

export const CROP_TEMPLATES_KEY="prints:crop-frame-templates:v1";
export const MAX_CROP_TEMPLATES=40;
export interface SavedCropTemplate {
  schemaVersion:1;
  id:string;
  name:string;
  widthMm:number;
  heightMm:number;
  /** Exactly one source crop per reusable template; no image bytes or URLs. */
  crop:CropRegion;
  cropShape:CropShape;
  cropPolygon?:ShapePoint[];
  /** Independent frame, projective correction and editable curve template. */
  cropStudio?:CropStudioDocument;
  orientation:{
    rotation:number;
    straighten:number;
    flipX:boolean;
    flipY:boolean;
  };
}
export function validCropTemplate(input:unknown):input is SavedCropTemplate{
  if(!input||typeof input!=="object"||Array.isArray(input))return false;
  const p=input as Record<string,unknown>;
  // Reject unforeseen payloads; saved styles must not carry source image data.
  const keys=["schemaVersion","id","name","widthMm","heightMm","crop",
    "cropShape","cropPolygon","cropStudio","orientation"];
  if(Object.keys(p).some(k=>!keys.includes(k)))return false;
  if(p.schemaVersion!==1||typeof p.id!=="string"||
    !/^[a-zA-Z0-9-]{1,100}$/.test(p.id)||
    typeof p.name!=="string"||p.name.trim()!==p.name||
    !p.name||p.name.length>60||/[\x00-\x1f\x7f]/.test(p.name)||
    ![p.widthMm,p.heightMm].every(v=>typeof v==="number"&&
      Number.isFinite(v)&&v>0&&v<=2000)||
    !validCropRegion(p.crop)||!validCropShape(p.cropShape)||
    (p.cropPolygon!==undefined&&!validCustomPolygon(p.cropPolygon))||
    (p.cropStudio!==undefined&&!validCropStudioDocument(p.cropStudio)))return false;
  const o=p.orientation;
  if(!o||typeof o!=="object"||Array.isArray(o))return false;
  const v=o as Record<string,unknown>;
  if(Object.keys(v).some(k=>!["rotation","straighten","flipX","flipY"].includes(k))||
    Object.keys(v).length!==4)return false;
  return [0,90,180,270].includes(v.rotation as number) &&
    typeof v.straighten==="number"&&Number.isFinite(v.straighten)&&
    v.straighten>=-15&&v.straighten<=15&&
    typeof v.flipX==="boolean"&&typeof v.flipY==="boolean";
}
export function parseCropTemplates(input:unknown):SavedCropTemplate[]{
  if(!Array.isArray(input))return [];
  const seenIds=new Set<string>(),seenNames=new Set<string>();
  const templates:SavedCropTemplate[]=[];
  for(const item of input){
    if(templates.length>=MAX_CROP_TEMPLATES)break;
    if(!validCropTemplate(item))continue;
    const lower=item.name.toLocaleLowerCase();
    if(seenIds.has(item.id)||seenNames.has(lower))continue;
    seenIds.add(item.id);seenNames.add(lower);
    templates.push(item);
  }
  return templates;
}
export function readCropTemplates():SavedCropTemplate[]{
  try{return parseCropTemplates(JSON.parse(localStorage.getItem(CROP_TEMPLATES_KEY)??"[]"));}
  catch{return [];}
}
export function writeCropTemplates(value:readonly SavedCropTemplate[]):void{
  if(!Array.isArray(value)||value.length>MAX_CROP_TEMPLATES||
    parseCropTemplates(value).length!==value.length)
    throw new Error("Crop template library needs unique names and valid geometry.");
  localStorage.setItem(CROP_TEMPLATES_KEY,JSON.stringify(value));
}
export function savedCropTemplate(
  id:string,name:string,value:Omit<SavedCropTemplate,"id"|"name"|"schemaVersion">,
):SavedCropTemplate{
  const candidate:SavedCropTemplate={...value,id,name:name.trim(),schemaVersion:1};
  if(!validCropTemplate(candidate))throw new Error("Enter a valid template name and crop.");
  // A template's geometry is independent from the source image object.
  return JSON.parse(JSON.stringify(candidate)) as SavedCropTemplate;
}
export function insertCropTemplate(library:readonly SavedCropTemplate[],
  item:SavedCropTemplate):SavedCropTemplate[]{
  if(library.length>=MAX_CROP_TEMPLATES)throw new Error("Template library is full.");
  if(library.some(t=>t.id===item.id||
    t.name.toLocaleLowerCase()===item.name.toLocaleLowerCase()))
    throw new Error("A template already uses this name.");
  const result=[...library,item];
  if(parseCropTemplates(result).length!==result.length)
    throw new Error("Invalid crop template.");
  return result;
}
export function renameCropTemplate(library:readonly SavedCropTemplate[],
  id:string,name:string):SavedCropTemplate[]{
  if(!library.some(t=>t.id===id))throw new Error("Choose a saved template.");
  const result=library.map(t=>t.id===id?{...t,name:name.trim()}:t);
  if(parseCropTemplates(result).length!==result.length)
    throw new Error("Template names must be unique and nonempty.");
  return result;
}
export function duplicateCropTemplate(library:readonly SavedCropTemplate[],
  id:string,newId:string,name:string):SavedCropTemplate[]{
  const source=library.find(t=>t.id===id);
  if(!source)throw new Error("Choose a saved template.");
  return insertCropTemplate(library,savedCropTemplate(newId,name,source));
}
export function deleteCropTemplate(library:readonly SavedCropTemplate[],
  id:string):SavedCropTemplate[]{
  if(!library.some(t=>t.id===id))throw new Error("Choose a saved template.");
  return library.filter(t=>t.id!==id);
}
