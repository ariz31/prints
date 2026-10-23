import type {StoredProject,StoredAsset} from "./projectStore.ts";
import {validProjectSettings} from "./projectStore.ts";
import {checkedImage,validAssetFields,consistentProcessedMetadata} from "./projectArchive.ts";
import {assertSafeSourceSize} from "./assetIntegrity.ts";
import {assertImageSignature} from "./imageSignatures.ts";
export {assertImageSignature} from "./imageSignatures.ts";
const te=new TextEncoder(),td=new TextDecoder("utf-8",{fatal:true});
const MAX_FILES=51,MAX_BYTES=256*1024*1024,MAX_IMAGE=25*1024*1024;
const MAX_MANIFEST=32*1024*1024; // Custom embedded font metadata may be >1 MiB.
const validName=(s:string)=>/^image-[0-9]{3}$/.test(s);
type StoredManifestAsset=Omit<StoredAsset,"original"|"processed">&{originalRef:number;processedRef?:number};
type ImageRecord={name:string;size:number;mime:string;sha256:string};
interface Manifest{format:"PRINTS_ZIP_PROJECT";schemaVersion:3;
 project:{name:string;settings:StoredProject["settings"];assets:StoredManifestAsset[]};
 images:ImageRecord[];}
interface FileEntry{name:string;blob:Blob;size:number;crc:number;offset:number}
function b16(buf:Uint8Array,offset:number,n:number){new DataView(buf.buffer).setUint16(offset,n,true);}
function b32(buf:Uint8Array,offset:number,n:number){new DataView(buf.buffer).setUint32(offset,n>>>0,true);}
function asBuffer(bytes:Uint8Array):ArrayBuffer{
 const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
 return copy.buffer as ArrayBuffer;
}
function safeName(name:string):boolean{
 return name==="manifest.json"||validName(name);
}
function encodeHeader(entry:FileEntry):Uint8Array{
 const n=te.encode(entry.name),b=new Uint8Array(30+n.byteLength);
 b32(b,0,0x04034b50);b16(b,4,20);b16(b,6,0x0800);b16(b,8,0);
 b32(b,14,entry.crc);b32(b,18,entry.size);b32(b,22,entry.size);
 b16(b,26,n.length);b.set(n,30);
 return b;
}
function central(entry:FileEntry):Uint8Array{
 const n=te.encode(entry.name),b=new Uint8Array(46+n.byteLength);
 b32(b,0,0x02014b50);b16(b,4,20);b16(b,6,20);
 b16(b,8,0x0800);b16(b,10,0);b32(b,16,entry.crc);
 b32(b,20,entry.size);b32(b,24,entry.size);b16(b,28,n.length);
 b32(b,42,entry.offset);b.set(n,46);return b;
}
async function crcBlob(blob:Blob):Promise<number>{
 let c=0xffffffff;
 const table=new Uint32Array(256);
 for(let i=0;i<256;i++){let n=i;for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;table[i]=n>>>0;}
 const reader=blob.stream().getReader();
 for(;;){
  const {value,done}=await reader.read();if(done)break;
  for(const b of value)c=table[(c^b)&255]^(c>>>8);
 }
 return (c^0xffffffff)>>>0;
}
async function sha(blob:Blob):Promise<string>{
 // Hash one image at a time (<=25 MiB), never the entire archive in RAM.
 const bytes=await blob.arrayBuffer();
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
function mediaValid(mime:string):boolean{
 return mime==="image/png"||mime==="image/jpeg"||mime==="image/webp";
}
/** Reject MIME spoofing; a declared image must carry the expected file signature. */
/**
 * Portable ZIP32 with STORE entries. Images are Blob parts, so the archive is
 * never flattened into a single in-memory byte array. Existing JSON backups
 * continue to use the old reader.
 */
export async function createProjectZipArchive(project:StoredProject):Promise<Blob>{
 if(project.schemaVersion!==1||!validProjectSettings(project.settings)||
    !project.name.trim()||project.assets.length>25)
  throw new Error("Invalid project data for ZIP backup.");
 const map=new Map<string,number>(),images:ImageRecord[]=[],blobs:Blob[]=[];
 const assets:StoredManifestAsset[]=[];
 let bytes=0;
 async function image(blob:Blob,processed:boolean):Promise<number>{
  checkedImage(blob,processed);
  await assertImageSignature(blob);
  const hash=await sha(blob),key=blob.type+":"+hash+":"+blob.size;
  const existing=map.get(key);
  if(existing!==undefined)return existing;
  bytes+=blob.size;
  if(bytes>MAX_BYTES)throw new Error("Portable ZIP exceeds 256 MiB unique image budget.");
  const index=images.length;
  if(index>=50)throw new Error("Too many unique images for ZIP.");
  const name="image-"+String(index).padStart(3,"0");
  images.push({name,size:blob.size,mime:blob.type,sha256:hash});
  blobs.push(blob);map.set(key,index);return index;
 }
 const ids=new Set<string>();
 for(const {original,processed,...meta} of project.assets){
  if(!validAssetFields(meta)||ids.has(meta.id)||
     !consistentProcessedMetadata(meta,processed!==undefined))
   throw new Error("Invalid, duplicated or inconsistent photo in project.");
  ids.add(meta.id);
  const originalRef=await image(original,false),processedRef=processed?await image(processed,true):undefined;
  assets.push({...meta,originalRef,...(processedRef!==undefined?{processedRef}:{})});
 }
 const manifest:Manifest={format:"PRINTS_ZIP_PROJECT",schemaVersion:3,
  project:{name:project.name,settings:project.settings,assets},images};
 const manifestBytes=te.encode(JSON.stringify(manifest));
 if(manifestBytes.byteLength>MAX_MANIFEST)throw new Error("Project metadata exceeds the 32 MiB limit. Reduce duplicated custom fonts.");
 const files:{name:string;blob:Blob}[]=[
  {name:"manifest.json",blob:new Blob([asBuffer(manifestBytes)],{type:"application/json"})},
  ...images.map((entry,i)=>({name:entry.name,blob:blobs[i]}))];
 if(files.length>MAX_FILES)throw new Error("Too many ZIP entries.");
 const entries:FileEntry[]=[];
 let offset=0;
 for(const file of files){
  if(!safeName(file.name)||file.blob.size>0xffffffff||file.blob.size===0)throw new Error("Invalid ZIP file entry.");
  const size=file.blob.size,crc=await crcBlob(file.blob);
  const entry={name:file.name,blob:file.blob,size,crc,offset};
  entries.push(entry);offset+=30+te.encode(file.name).length+size;
  if(offset>0xffffffff)throw new Error("ZIP exceeds ZIP32 size limits.");
 }
 const directory=entries.map(central),dirBytes=directory.reduce((a,b)=>a+b.byteLength,0);
 const total=offset+dirBytes+22;
 if(total>0xffffffff)throw new Error("ZIP output too large.");
 const end=new Uint8Array(22);
 b32(end,0,0x06054b50);b16(end,8,entries.length);b16(end,10,entries.length);
 b32(end,12,dirBytes);b32(end,16,offset);
 const parts:BlobPart[]=[];
 for(const entry of entries)parts.push(asBuffer(encodeHeader(entry)),entry.blob);
 for(const data of directory)parts.push(asBuffer(data));
 parts.push(asBuffer(end));
 return new Blob(parts,{type:"application/zip"});
}
async function slice(file:Blob,start:number,length:number):Promise<Uint8Array>{
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||start+length>file.size)
  throw new Error("Backup has invalid ZIP boundaries.");
 return new Uint8Array(await file.slice(start,start+length).arrayBuffer());
}
interface Entry{name:string;offset:number;size:number;crc:number}
async function unzipStoreEntries(file:Blob):Promise<Map<string,Blob>>{
 if(file.size<100||file.size>MAX_BYTES+MAX_MANIFEST+2*1024*1024)throw new Error("Unsupported ZIP backup size.");
 const tail=await slice(file,file.size-22,22),e=new DataView(tail.buffer);
 if(e.getUint32(0,true)!==0x06054b50||e.getUint16(4,true)!==0||
    e.getUint16(6,true)!==0||e.getUint16(20,true)!==0)
  throw new Error("Unsupported ZIP archive structure.");
 const count=e.getUint16(10,true),dirSize=e.getUint32(12,true),dirStart=e.getUint32(16,true);
 if(count<1||count>MAX_FILES||e.getUint16(8,true)!==count||
   dirStart+dirSize!==file.size-22)
  throw new Error("Malformed ZIP directory.");
 const dir=await slice(file,dirStart,dirSize),view=new DataView(dir.buffer);
 let pos=0,uncompressed=0;
 const entries:Entry[]=[];const names=new Set<string>();
 for(let i=0;i<count;i++){
  if(pos+46>dir.length||view.getUint32(pos,true)!==0x02014b50)
   throw new Error("Invalid ZIP central entry.");
  const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true);
  const crc=view.getUint32(pos+16,true),compressed=view.getUint32(pos+20,true);
  const size=view.getUint32(pos+24,true),n=view.getUint16(pos+28,true);
  const extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
  const disk=view.getUint16(pos+34,true),offset=view.getUint32(pos+42,true);
  if(method!==0||flags!==0x0800||size!==compressed||
     n===0||n>80||pos+46+n+extra+comment>dir.length||disk!==0)
   throw new Error("Unsupported or unsafe ZIP entry.");
  const name=td.decode(dir.subarray(pos+46,pos+46+n));
  if(!safeName(name)||names.has(name))throw new Error("Unsafe or duplicated archive filename.");
  names.add(name);uncompressed+=size;
  if(size>MAX_IMAGE && name!=="manifest.json"||
    name==="manifest.json"&&size>MAX_MANIFEST||uncompressed>MAX_BYTES+MAX_MANIFEST)
    throw new Error("Archive exceeds safe image limits.");
  entries.push({name,offset,size,crc});pos+=46+n+extra+comment;
 }
 if(pos!==dir.length||!names.has("manifest.json"))throw new Error("Invalid backup manifest directory.");
 const blobs=new Map<string,Blob>();
 // This application creates contiguous STORE entries. Reject overlapping,
 // aliased or unindexed bytes rather than trusting forged central offsets.
 const ordered=[...entries].sort((a,b)=>a.offset-b.offset);
 let boundary=0;
 for(const entry of ordered){
  if(entry.offset!==boundary)throw new Error("ZIP entries overlap or contain unindexed bytes.");
  const header=await slice(file,entry.offset,30);
  const h=new DataView(header.buffer);
  if(h.getUint32(0,true)!==0x04034b50||
    h.getUint16(6,true)!==0x0800||h.getUint16(8,true)!==0||
    h.getUint32(14,true)!==entry.crc||h.getUint32(18,true)!==entry.size||
    h.getUint32(22,true)!==entry.size)
    throw new Error("ZIP local file header mismatch.");
  const nameLength=h.getUint16(26,true),extra=h.getUint16(28,true);
  if(nameLength<1||nameLength>80)throw new Error("Invalid ZIP filename length.");
  const name=td.decode(await slice(file,entry.offset+30,nameLength));
  if(name!==entry.name)throw new Error("ZIP directory/filename mismatch.");
  const dataStart=entry.offset+30+nameLength+extra;
  if(dataStart+entry.size>dirStart)throw new Error("ZIP entry overlaps central directory.");
  boundary=dataStart+entry.size;
  const content=file.slice(dataStart,boundary);
  if(await crcBlob(content)!==entry.crc)throw new Error("Backup ZIP entry failed CRC integrity.");
  blobs.set(entry.name,content);
 }
 if(boundary!==dirStart)throw new Error("ZIP contains unindexed bytes before directory.");
 return blobs;
}
export async function readProjectZipArchive(file:Blob):Promise<StoredProject>{
 const extracted=await unzipStoreEntries(file);
 const manifestBlob=extracted.get("manifest.json");
 if(!manifestBlob)throw new Error("Backup manifest missing.");
 let payload:unknown;
 try{payload=JSON.parse(await manifestBlob.text()) as unknown;}
 catch{throw new Error("Invalid backup manifest JSON.");}
 if(!payload||typeof payload!=="object")throw new Error("Invalid ZIP backup manifest.");
 const m=payload as Partial<Manifest>;
 if(m.format!=="PRINTS_ZIP_PROJECT"||m.schemaVersion!==3||
   !m.project||!Array.isArray(m.images)||m.images.length>50||
   !Array.isArray(m.project.assets)||m.project.assets.length>25||
   typeof m.project.name!=="string"||!m.project.name.trim()||
   !validProjectSettings(m.project.settings))
   throw new Error("Unsupported or corrupt PRINTS ZIP project.");
 const images:Blob[]=[];
 for(let i=0;i<m.images.length;i++){
  const data=m.images[i];
  if(!data||data.name!=="image-"+String(i).padStart(3,"0")||
    !Number.isSafeInteger(data.size)||data.size<1||data.size>MAX_IMAGE||
    typeof data.sha256!=="string"||!/^[a-f0-9]{64}$/.test(data.sha256)||
    typeof data.mime!=="string"||!mediaValid(data.mime))
   throw new Error("Invalid ZIP image metadata.");
  const entry=extracted.get(data.name);
  if(!entry||entry.size!==data.size)throw new Error("ZIP image is missing.");
  const blob=new Blob([entry],{type:data.mime});
  await assertImageSignature(blob);
  if(await sha(blob)!==data.sha256)throw new Error("ZIP image failed its SHA-256 check.");
  images.push(blob);
 }
 if(images.length+1!==extracted.size)throw new Error("Unexpected files in project ZIP.");
 const ids=new Set<string>(),assets:StoredAsset[]=[];
 for(const entry of m.project.assets){
  if(!entry||!validAssetFields(entry as unknown as Record<string,unknown>)||
     ids.has(entry.id))throw new Error("Invalid or duplicated design in ZIP.");
  ids.add(entry.id);
  const a=entry.originalRef,b=entry.processedRef;
  if(!Number.isSafeInteger(a)||a<0||a>=images.length||
     b!==undefined&&(!Number.isSafeInteger(b)||b<0||b>=images.length))
   throw new Error("Bad ZIP image reference.");
  if(!consistentProcessedMetadata(entry,b!==undefined))
   throw new Error("ZIP processed image dimensions have no image attachment.");
  const original=images[a],processed=b===undefined?undefined:images[b];
  checkedImage(original,false);
  if(processed)checkedImage(processed,true);
  assertSafeSourceSize(entry.pixelWidth,entry.pixelHeight);
  if(entry.processedWidth&&entry.processedHeight)
   assertSafeSourceSize(entry.processedWidth,entry.processedHeight);
  const {originalRef:_original,processedRef:_processed,...meta}=entry;
  void _original;void _processed;
  assets.push({...meta,original,...(processed?{processed}:{})});
 }
 return {schemaVersion:1,id:crypto.randomUUID(),
  name:m.project.name+" (imported)",updatedAt:new Date().toISOString(),
  settings:m.project.settings,assets};
}
