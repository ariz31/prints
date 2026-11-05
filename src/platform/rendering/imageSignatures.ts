/** File-format sanity check independent of MIME metadata.
 * This rejects mislabeled/obviously corrupt user archives. It is not an
 * image decoder or a substitute for CRC/SHA-256 archive integrity.
 */
export async function assertImageSignature(blob:Blob):Promise<void>{
 const mime=blob.type;
 if(!["image/png","image/jpeg","image/webp"].includes(mime))
  throw new Error("Unsupported image MIME in backup.");
 const bytes=new Uint8Array(await blob.slice(0,12).arrayBuffer());
 const ascii=(offset:number,value:string)=>[...value].every((c,i)=>bytes[offset+i]===c.charCodeAt(0));
 const valid=mime==="image/png"
  ?bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
  :mime==="image/jpeg"
   ?bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
   :bytes.length>=12&&ascii(0,"RIFF")&&ascii(8,"WEBP");
 if(!valid)throw new Error("Backup image MIME does not match file signature.");
}
