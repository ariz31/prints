import type {StoredProject} from "./projectStore.ts";

/** Android file pickers may return File objects backed by transient provider
 * handles. IndexedDB can later reject these as InvalidBlob even when an <img>
 * successfully decoded them. Copy the bytes into a browser-owned Blob first.
 */
export async function copyBlobBytes(source:Blob):Promise<Blob>{
  if(!(source instanceof Blob)||source.size<1)
    throw new Error("Image bytes are missing. Reimport the affected photo.");
  const bytes=await source.arrayBuffer();
  if(bytes.byteLength!==source.size)
    throw new Error("Image bytes changed during import. Reimport the affected photo.");
  return new Blob([bytes],{type:source.type});
}

export function isInvalidBlobFailure(error:unknown):boolean{
  const message=error instanceof Error
    ? error.name+" "+error.message:String(error);
  return /invalid[\s_-]*blob/i.test(message);
}

/** One-shot repair for older snapshots containing provider-backed Blobs.
 * Preserve shared source identity and the exact metadata/revision token.
 * Never silently retry quota or concurrency failures.
 */
export async function copyProjectBlobBytes(project:StoredProject):Promise<StoredProject>{
  const copies=new Map<Blob,Promise<Blob>>();
  const stable=(blob:Blob):Promise<Blob>=>{
    let copy=copies.get(blob);
    if(!copy){copy=copyBlobBytes(blob);copies.set(blob,copy);}
    return copy;
  };
  const assets=[];
  for(const item of project.assets){
    assets.push({...item,original:await stable(item.original),
      ...(item.processed?{processed:await stable(item.processed)}:{})});
  }
  return {...project,assets};
}
