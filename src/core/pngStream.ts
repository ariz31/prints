const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){
 let c=n;
 for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
 crcTable[n]=c>>>0;
}
function chunk(type:string,data:Uint8Array):Uint8Array {
 const encoded=new TextEncoder().encode(type);
 const out=new Uint8Array(12+data.byteLength);
 const view=new DataView(out.buffer);
 view.setUint32(0,data.byteLength,false);
 out.set(encoded,4);out.set(data,8);
 let crc=0xffffffff;
 for(let i=4;i<8+data.byteLength;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);
 view.setUint32(8+data.byteLength,(crc^0xffffffff)>>>0,false);
 return out;
}
export interface RgbaStripe {y:number;rows:number;data:Uint8Array}
/**
 * Encode a PNG from scanline stripes without allocating a full-size Canvas.
 * Each row uses PNG filter 0; a zlib/deflate stream compresses incrementally.
 */
export async function encodeRgbaPng(width:number,height:number,
 readStripe:(y:number,rows:number)=>Promise<Uint8Array>|Uint8Array,
):Promise<Blob>{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
   width<=0||height<=0||width>16000||height>16000||
   width*height>160_000_000)throw new Error("Invalid streamed PNG dimensions.");
 if(typeof CompressionStream==="undefined")
   throw new Error("This browser does not support memory-efficient PNG export.");
 const ihdr=new Uint8Array(13),header=new DataView(ihdr.buffer);
 header.setUint32(0,width);header.setUint32(4,height);
 ihdr[8]=8;ihdr[9]=6; // RGBA, 8 bits per channel.
 const parts:BlobPart[]=[signature,chunk("IHDR",ihdr)];
 const compression=new CompressionStream("deflate");
 const writer=compression.writable.getWriter();
 const readTask=(async()=>{
  const reader=compression.readable.getReader();
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   if(value?.byteLength)parts.push(chunk("IDAT",value));
  }
 })();
 try{
  const stripeRows=Math.max(1,Math.min(64,Math.floor(2_000_000/width)));
  for(let y=0;y<height;y+=stripeRows){
   const rows=Math.min(stripeRows,height-y);
   const rgba=await readStripe(y,rows);
   if(rgba.byteLength!==width*rows*4)throw new Error("Invalid RGBA stripe.");
   const rowSize=width*4;
   const filtered=new Uint8Array(rows*(rowSize+1));
   for(let row=0;row<rows;row++)
    filtered.set(rgba.subarray(row*rowSize,(row+1)*rowSize),row*(rowSize+1)+1);
   await writer.write(filtered);
  }
  await writer.close();await readTask;
 }catch(error){
  await writer.abort(error).catch(()=>undefined);
  await readTask.catch(()=>undefined);
  throw error;
 }
 parts.push(chunk("IEND",new Uint8Array()));
 return new Blob(parts,{type:"image/png"});
}
