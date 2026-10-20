import type { StoredProject, StoredAsset } from "./projectStore.ts";
import { validProjectSettings } from "./projectStore.ts";
import { validDesignLayers } from "./layers.ts";
import { validPhotoAdjustments } from "./photoAdjustments.ts";
import { assertSafeSourceSize } from "./assetIntegrity.ts";

/**
 * V2 self-contained portable project: unique images are stored once and design
 * variants refer to them by index. V1 backups remain importable.
 * The IndexedDB project schema is still V1 and does not need migration.
 */
export const PROJECT_ARCHIVE_LIMIT_BYTES = 48 * 1024 * 1024;
const ARCHIVE_FILE_LIMIT = 70 * 1024 * 1024;
const MAX_ASSETS = 25;
const MAX_UNIQUE_IMAGES = MAX_ASSETS * 2;
type ImageEnvelope = { mime: string; data: string; sha256?: string };
type EncodedAsset = Omit<StoredAsset, "original" | "processed"> & {
  originalRef: number; processedRef?: number;
};
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function checkedImage(blob: Blob, isProcessed: boolean): void {
  if (blob.size < 1 || blob.size > 25 * 1024 * 1024 ||
    !(isProcessed ? blob.type === "image/png" : MIME.has(blob.type))) {
    throw new Error("Project archive contains an unsupported or oversized image.");
  }
}
function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 24_576) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24_576))));
  }
  return parts.join("");
}
function fromBase64(data: string): Uint8Array {
  if (!data || data.length > 35 * 1024 * 1024 ||
      data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error("Project archive contains invalid image encoding.");
  }
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function hash(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, v => v.toString(16).padStart(2, "0")).join("");
}
function validAssetFields(a: Record<string, unknown>): boolean {
  const positive = ["widthMm","heightMm","pixelWidth","pixelHeight"].every((k) =>
    typeof a[k] === "number" && Number.isFinite(a[k]) && (a[k] as number) > 0 &&
    (a[k] as number) <= (k === "widthMm" || k === "heightMm" ? 2000 : 16000));
  const bounded = ["focalX","focalY"].every((k) =>
    typeof a[k] === "number" && Number.isFinite(a[k]) &&
    (a[k] as number) >= 0 && (a[k] as number) <= 100);
  if (!positive || !bounded || typeof a.id !== "string" || !a.id ||
      typeof a.name !== "string" || a.name.length > 250 ||
      !Number.isSafeInteger(a.quantity) || (a.quantity as number) < 1 ||
      (a.quantity as number) > 1000) return false;
  const c = a.crop;
  if (!c || typeof c !== "object") return false;
  const crop = c as Record<string, unknown>;
  if (!["x","y","width","height"].every((k) => typeof crop[k] === "number" &&
      Number.isFinite(crop[k]))) return false;
  const [x,y,w,h] = ["x","y","width","height"].map(k => crop[k] as number);
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > 1.000001 || y+h > 1.000001) return false;
  if (a.layers !== undefined && !validDesignLayers(a.layers)) return false;
  if (a.adjustments !== undefined && !validPhotoAdjustments(a.adjustments)) return false;
  if (a.processedWidth !== undefined && (typeof a.processedWidth !== "number" ||
      !Number.isFinite(a.processedWidth) || a.processedWidth <= 0)) return false;
  if (a.processedHeight !== undefined && (typeof a.processedHeight !== "number" ||
      !Number.isFinite(a.processedHeight) || a.processedHeight <= 0)) return false;
  // The portable format must never accept a job the local editor cannot reopen.
  if ((a.processedWidth === undefined) !== (a.processedHeight === undefined)) return false;
  try {
    assertSafeSourceSize(a.pixelWidth as number,a.pixelHeight as number);
    if (a.processedWidth !== undefined && a.processedHeight !== undefined) {
      assertSafeSourceSize(a.processedWidth as number,a.processedHeight as number);
    }
  } catch {
    return false;
  }
  return true;
}

export async function createProjectArchive(project: StoredProject): Promise<Blob> {
  if (project.schemaVersion !== 1 || !validProjectSettings(project.settings) ||
    !project.name.trim() || project.name.length > 100 || !Array.isArray(project.assets) ||
    project.assets.length > MAX_ASSETS) throw new Error("Cannot export an invalid project.");
  const ids=new Set<string>(), indexes=new Map<string, number>();
  const images: ImageEnvelope[]=[];
  const assets: EncodedAsset[]=[];
  let uniqueBytes=0;
  async function storeImage(blob:Blob,processed:boolean):Promise<number>{
    checkedImage(blob,processed);
    const bytes=await blob.arrayBuffer();
    const sha256=await hash(bytes);
    const key=blob.type+":"+bytes.byteLength+":"+sha256;
    const found=indexes.get(key);
    if(found!==undefined)return found;
    uniqueBytes+=bytes.byteLength;
    if(uniqueBytes>PROJECT_ARCHIVE_LIMIT_BYTES)
      throw new Error("Unique project images exceed the 48 MiB portable backup limit.");
    const index=images.length;
    images.push({mime:blob.type,data:toBase64(new Uint8Array(bytes)),sha256});
    indexes.set(key,index);
    return index;
  }
  for(const {original,processed,...meta} of project.assets){
    if(!validAssetFields(meta)||ids.has(meta.id))
      throw new Error("Invalid project asset metadata.");
    ids.add(meta.id);
    const originalRef=await storeImage(original,false);
    const processedRef=processed?await storeImage(processed,true):undefined;
    assets.push({...meta,originalRef,...(processedRef!==undefined?{processedRef}:{})});
  }
  const result={
    format:"PRINTS_PROJECT",schemaVersion:2,
    images,
    project:{id:project.id,name:project.name,updatedAt:project.updatedAt,
      settings:project.settings,assets},
  };
  const archive=new Blob([JSON.stringify(result)],{type:"application/json"});
  if(archive.size>ARCHIVE_FILE_LIMIT)
    throw new Error("Portable project backup is too large.");
  return archive;
}
async function unpackImage(value:unknown, requireHash:boolean):Promise<Blob>{
  if(!value||typeof value!=="object")
    throw new Error("Image payload missing from project archive.");
  const image=value as Record<string,unknown>;
  if(typeof image.mime!=="string"||typeof image.data!=="string"||
    (requireHash && (typeof image.sha256!=="string" || !/^[a-f0-9]{64}$/.test(image.sha256))))
    throw new Error("Project archive has an invalid image payload.");
  const bytes=fromBase64(image.data);
  if(requireHash && await hash(bytes.buffer as ArrayBuffer)!==image.sha256)
    throw new Error("Project backup image failed its integrity check.");
  const blob=new Blob([new Uint8Array(bytes)],{type:image.mime});
  // MIME role (original vs processed) is checked when the image is referenced.
  checkedImage(blob,false);
  return blob;
}
export async function readProjectArchive(file: Blob):Promise<StoredProject>{
  if(file.size<1||file.size>ARCHIVE_FILE_LIMIT)
    throw new Error("Unsupported backup size (maximum 70 MiB).");
  let content:unknown;
  try{content=JSON.parse(await file.text()) as unknown;}
  catch{throw new Error("This file is not a valid PRINTS project backup.");}
  if(!content||typeof content!=="object")
    throw new Error("Unsupported project backup.");
  const root=content as Record<string,unknown>;
  if(root.format!=="PRINTS_PROJECT"||
    (root.schemaVersion!==1 && root.schemaVersion!==2)||
    !root.project||typeof root.project!=="object")
    throw new Error("Unsupported project backup version.");
  const p=root.project as Record<string,unknown>;
  if(typeof p.name!=="string"||!p.name.trim()||p.name.length>100||
    !validProjectSettings(p.settings)||!Array.isArray(p.assets)||
    p.assets.length>MAX_ASSETS)
    throw new Error("Invalid project metadata in backup.");
  const imageBlobs:Blob[]=[];
  let total=0;
  if(root.schemaVersion===2){
    if(!Array.isArray(root.images)||root.images.length>MAX_UNIQUE_IMAGES)
      throw new Error("Invalid project image collection.");
    for(const image of root.images){
      const blob=await unpackImage(image,true);
      total+=blob.size;
      if(total>PROJECT_ARCHIVE_LIMIT_BYTES)
        throw new Error("Project exceeds the portable backup limit.");
      imageBlobs.push(blob);
    }
  }
  const ids=new Set<string>(), assets:StoredAsset[]=[];
  for(const raw of p.assets){
    if(!raw||typeof raw!=="object")throw new Error("Invalid backup asset.");
    const a=raw as Record<string,unknown>;
    if(!validAssetFields(a)||ids.has(a.id as string))
      throw new Error("Invalid or duplicated print item in backup.");
    ids.add(a.id as string);
    let original:Blob,processed:Blob|undefined;
    if(root.schemaVersion===2){
      if(!Number.isSafeInteger(a.originalRef)|| (a.originalRef as number)<0 ||
        (a.originalRef as number)>=imageBlobs.length ||
        (a.processedRef!==undefined&&(!Number.isSafeInteger(a.processedRef)||
          (a.processedRef as number)<0||(a.processedRef as number)>=imageBlobs.length)))
        throw new Error("Project image reference is invalid.");
      original=imageBlobs[a.originalRef as number];
      processed=a.processedRef===undefined?undefined:imageBlobs[a.processedRef as number];
      checkedImage(original,false);
      if(processed)checkedImage(processed,true);
    }else{
      original=await unpackImage(a.original,false);
      processed=a.processed===undefined?undefined:await unpackImage(a.processed,false);
      if(processed)checkedImage(processed,true);
      total+=original.size+(processed?.size??0);
      if(total>PROJECT_ARCHIVE_LIMIT_BYTES)
        throw new Error("Project exceeds the portable backup limit.");
    }
    const {original:ignoredOriginal,processed:ignoredProcessed,
      originalRef:ignoredRef,processedRef:ignoredProcessedRef,...metadata}=a;
    void ignoredOriginal;void ignoredProcessed;void ignoredRef;void ignoredProcessedRef;
    assets.push({...metadata,original,...(processed?{processed}:{})} as StoredAsset);
  }
  return {schemaVersion:1,id:crypto.randomUUID(),
    name:p.name+" (imported)",updatedAt:new Date().toISOString(),
    settings:p.settings as StoredProject["settings"],assets};
}
