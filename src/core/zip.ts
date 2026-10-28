/** ZIP32 STORE writer. Compressed PNGs are never recompressed or copied into
 * a second large JavaScript buffer. Header bytes and CRC state remain bounded.
 * The resulting archive is compatible with the original PRINTS batch format. */
const encoder=new TextEncoder();
const MAX_FILES=25;
export const MAX_ARCHIVE_BYTES=96*1024*1024;
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){
 let c=i;
 for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
 crcTable[i]=c>>>0;
}
export interface ZipEntry{name:string;data:Uint8Array}
export interface ZipBlobEntry{name:string;data:Blob}
function crcUpdate(previous:number,chunk:Uint8Array):number{
 let crc=previous;
 for(const byte of chunk)crc=crcTable[(crc^byte)&255]^(crc>>>8);
 return crc>>>0;
}
export function crc32(data:Uint8Array):number{
 return (crcUpdate(0xffffffff,data)^0xffffffff)>>>0;
}
function aborted(signal?:AbortSignal):void{
 if(signal?.aborted)throw new Error("Batch export canceled.");
}
async function crcBlob(blob:Blob,signal?:AbortSignal):Promise<number>{
 let crc=0xffffffff;
 for(let offset=0;offset<blob.size;offset+=512*1024){
  aborted(signal);
  const bytes=new Uint8Array(await blob.slice(offset,offset+512*1024).arrayBuffer());
  aborted(signal);
  crc=crcUpdate(crc,bytes);
 }
 return (crc^0xffffffff)>>>0;
}
interface Prepared{name:Uint8Array;data:Blob;crc:number;offset:number}
function validateFiles<T extends {name:string;data:{size:number}}>(
 files:readonly T[],maxBytes:number,
):Array<{name:Uint8Array;data:T["data"]}>{
 if(files.length<1||files.length>MAX_FILES||!Number.isSafeInteger(maxBytes)||maxBytes<1)
  throw new Error("ZIP supports 1 to 25 image designs.");
 const names=new Set<string>();
 let size=22;
 return files.map(file=>{
  if(typeof file.name!=="string"||!file.data||
    !Number.isSafeInteger(file.data.size)||file.data.size<1)
    throw new Error("Invalid ZIP image entry.");
  const name=encoder.encode(file.name);
  if(name.length<1||name.length>150||file.name.includes("/")||
    file.name.includes("\\")||file.name.startsWith(".")||names.has(file.name))
    throw new Error("Unsafe or duplicated ZIP filename.");
  names.add(file.name);
  size+=76+name.length*2+file.data.size;
  if(size>maxBytes||size>MAX_ARCHIVE_BYTES)
    throw new Error("Batch exceeds the 96 MiB ZIP limit. Export fewer designs.");
  return {name,data:file.data};
 });
}
function u16(bytes:Uint8Array,index:number,value:number):void{
 new DataView(bytes.buffer).setUint16(index,value,true);
}
function u32(bytes:Uint8Array,index:number,value:number):void{
 new DataView(bytes.buffer).setUint32(index,value,true);
}
function local(entry:Prepared):Uint8Array{
 const bytes=new Uint8Array(30+entry.name.length);
 u32(bytes,0,0x04034b50);u16(bytes,4,20);u16(bytes,6,0x0800);
 u16(bytes,8,0);u16(bytes,10,0);u16(bytes,12,0x0021);
 u32(bytes,14,entry.crc);u32(bytes,18,entry.data.size);u32(bytes,22,entry.data.size);
 u16(bytes,26,entry.name.length);u16(bytes,28,0);
 bytes.set(entry.name,30);return bytes;
}
function central(entry:Prepared):Uint8Array{
 const bytes=new Uint8Array(46+entry.name.length);
 u32(bytes,0,0x02014b50);u16(bytes,4,20);u16(bytes,6,20);
 u16(bytes,8,0x0800);u16(bytes,10,0);u16(bytes,12,0);u16(bytes,14,0x0021);
 u32(bytes,16,entry.crc);u32(bytes,20,entry.data.size);u32(bytes,24,entry.data.size);
 u16(bytes,28,entry.name.length);u16(bytes,30,0);u16(bytes,32,0);
 u16(bytes,34,0);u16(bytes,36,0);u32(bytes,38,0);u32(bytes,42,entry.offset);
 bytes.set(entry.name,46);return bytes;
}
function assemble(entries:Prepared[]):Blob{
 let offset=0;
 const parts:BlobPart[]=[];
 for(const entry of entries){
  entry.offset=offset;
  const header=local(entry);
  parts.push(header,entry.data);
  offset+=header.byteLength+entry.data.size;
 }
 const directory=entries.map(central);
 const directorySize=directory.reduce((sum,bytes)=>sum+bytes.byteLength,0);
 const end=new Uint8Array(22);
 u32(end,0,0x06054b50);u16(end,4,0);u16(end,6,0);
 u16(end,8,entries.length);u16(end,10,entries.length);
 u32(end,12,directorySize);u32(end,16,offset);u16(end,20,0);
 parts.push(...directory,end);
 return new Blob(parts,{type:"application/zip"});
}
/** Backward-compatible synchronous writer for callers with bytes in memory. */
export function createStoredZip(files:readonly ZipEntry[],maxBytes=MAX_ARCHIVE_BYTES):Blob{
 const prepared=validateFiles(files.map(f=>({
  name:f.name,data:{size:f.data instanceof Uint8Array?f.data.byteLength:0},
 })),maxBytes);
 const entries:Prepared[]=files.map((file,i)=>{
  if(!(file.data instanceof Uint8Array)||!file.data.byteLength)
   throw new Error("Invalid ZIP image entry.");
  return {name:prepared[i].name,data:new Blob([file.data]),crc:crc32(file.data),offset:0};
 });
 return assemble(entries);
}
/** Bounded-memory batch writer: one 512 KiB checksum slice at a time, no full
 * PNG ArrayBuffers, no duplicate archive-sized output allocation. */
export async function createStoredZipFromBlobs(
 files:readonly ZipBlobEntry[],maxBytes=MAX_ARCHIVE_BYTES,
 signal?:AbortSignal,
):Promise<Blob>{
 aborted(signal);
 const prepared=validateFiles(files,maxBytes);
 const entries:Prepared[]=[];
 for(const file of prepared){
  aborted(signal);
  if(!(file.data instanceof Blob))throw new Error("Invalid ZIP image entry.");
  const crc=await crcBlob(file.data,signal);
  entries.push({name:file.name,data:file.data,crc,offset:0});
 }
 aborted(signal);
 return assemble(entries);
}
