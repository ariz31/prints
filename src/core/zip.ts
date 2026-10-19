/** Bounded ZIP32 writer using stored (already-compressed PNG) entries. No dependencies. */
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
export function crc32(data:Uint8Array):number{
 let crc=0xffffffff;
 for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
}
export function createStoredZip(files:readonly ZipEntry[],maxBytes=MAX_ARCHIVE_BYTES):Blob{
 if(files.length<1||files.length>MAX_FILES||!Number.isSafeInteger(maxBytes)||maxBytes<1)
  throw new Error("ZIP supports 1 to 25 image designs.");
 const names=new Set<string>();
 const encoded=files.map(file=>{
  if(typeof file.name!=="string"||!(file.data instanceof Uint8Array)||
    file.data.byteLength<1)throw new Error("Invalid ZIP image entry.");
  const name=encoder.encode(file.name);
  if(name.length<1||name.length>150||file.name.includes("/")||file.name.includes("\\")||
    file.name.startsWith(".")||names.has(file.name))
    throw new Error("Unsafe or duplicated ZIP filename.");
  names.add(file.name);
  return {name,data:file.data,crc:crc32(file.data)};
 });
 const localBytes=encoded.reduce((n,e)=>n+30+e.name.length+e.data.byteLength,0);
 const centralBytes=encoded.reduce((n,e)=>n+46+e.name.length,0);
 const total=localBytes+centralBytes+22;
 if(total>maxBytes||total>MAX_ARCHIVE_BYTES)
   throw new Error("Batch exceeds the 96 MiB ZIP limit. Export fewer designs.");
 const output=new Uint8Array(total);
 const view=new DataView(output.buffer);
 const u16=(o:number,n:number)=>view.setUint16(o,n,true);
 const u32=(o:number,n:number)=>view.setUint32(o,n,true);
 const offsets:number[]=[];
 let pos=0;
 for(const item of encoded){
  offsets.push(pos);
  u32(pos,0x04034b50);u16(pos+4,20);u16(pos+6,0x0800); // UTF-8 name
  u16(pos+8,0);u16(pos+10,0);u16(pos+12,0x0021); // STORE, DOS date 1980-01-01
  u32(pos+14,item.crc);u32(pos+18,item.data.length);u32(pos+22,item.data.length);
  u16(pos+26,item.name.length);u16(pos+28,0);
  pos+=30;output.set(item.name,pos);pos+=item.name.length;
  output.set(item.data,pos);pos+=item.data.length;
 }
 const directoryStart=pos;
 encoded.forEach((item,i)=>{
  u32(pos,0x02014b50);u16(pos+4,20);u16(pos+6,20);
  u16(pos+8,0x0800);u16(pos+10,0);u16(pos+12,0);u16(pos+14,0x0021);
  u32(pos+16,item.crc);u32(pos+20,item.data.length);u32(pos+24,item.data.length);
  u16(pos+28,item.name.length);u16(pos+30,0);u16(pos+32,0);
  u16(pos+34,0);u16(pos+36,0);u32(pos+38,0);u32(pos+42,offsets[i]);
  pos+=46;output.set(item.name,pos);pos+=item.name.length;
 });
 const directoryLength=pos-directoryStart;
 u32(pos,0x06054b50);u16(pos+4,0);u16(pos+6,0);
 u16(pos+8,encoded.length);u16(pos+10,encoded.length);
 u32(pos+12,directoryLength);u32(pos+16,directoryStart);u16(pos+20,0);
 return new Blob([new Uint8Array(output)],{type:"application/zip"});
}
