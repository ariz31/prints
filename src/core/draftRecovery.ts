import type {StoredProject} from "./projectStore.ts";
/** Unsaved drafts are kept in a separate, versioned IndexedDB store.
 * They are never promoted over named project IDs automatically.
 */
const DB="prints-untitled-recovery-v1";
const STORE="drafts";
const LIMIT=6;
export interface RecoveryRecord {id:string;revision:number;updatedAt:string;project:StoredProject}
export type RecoverySummary=Pick<RecoveryRecord,"id"|"revision"|"updatedAt"> & {name:string;images:number};
function valid(record:unknown):record is RecoveryRecord {
 if(!record||typeof record!=="object")return false;
 const r=record as Record<string,unknown>;
 const p=r.project as StoredProject|undefined;
 return typeof r.id==="string"&&r.id.length<=100&&!!r.id&&
  Number.isSafeInteger(r.revision)&&(r.revision as number)>0&&
  typeof r.updatedAt==="string"&&Number.isFinite(Date.parse(r.updatedAt))&&
  !!p&&p.schemaVersion===1&&Array.isArray(p.assets)&&p.assets.length<=25;
}
function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined"){reject(new Error("Browser recovery storage unavailable."));return;}
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:"id"});};
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
  req.onerror=()=>reject(req.error??new Error("Cannot open draft recovery storage."));
  req.onblocked=()=>reject(new Error("Close other tabs before accessing draft recovery storage."));
 });
}
async function operation<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,tx:IDBTransaction)=>void,
 result:()=>T):Promise<T>{
 const db=await open();
 return new Promise<T>((resolve,reject)=>{
  const tx=db.transaction(STORE,mode);
  tx.oncomplete=()=>{db.close();resolve(result());};
  tx.onabort=()=>{db.close();reject(tx.error??new Error("Draft recovery write failed."));};
  try{work(tx.objectStore(STORE),tx);}catch(error){db.close();reject(error);}
 });
}
export async function listRecoverableDrafts():Promise<RecoverySummary[]>{
 let records:RecoveryRecord[]=[];
 await operation("readonly",store=>{
  store.getAll().onsuccess=event=>{records=(event.target as IDBRequest<RecoveryRecord[]>).result;};
 },()=>undefined);
 return records.filter(valid).sort((a,b)=>b.revision-a.revision).slice(0,LIMIT)
  .map(r=>({id:r.id,revision:r.revision,updatedAt:r.updatedAt,
   name:r.project.name,images:r.project.assets.length}));
}
export async function loadRecoverableDraft(id:string):Promise<StoredProject>{
 if(!id||id.length>100)throw new Error("Invalid recovery ID.");
 let recovered:RecoveryRecord|undefined;
 await operation("readonly",store=>{
  store.get(id).onsuccess=event=>{recovered=(event.target as IDBRequest<RecoveryRecord|undefined>).result;};
 },()=>undefined);
 if(!valid(recovered)||recovered.id!==id)throw new Error("Unsaved draft unavailable or invalid.");
 return recovered.project;
}
/** No old snapshot may replace a newer one, including across async tab writes. */
export async function storeRecoverableDraft(id:string,revision:number,project:StoredProject):Promise<boolean>{
 if(!id||id.length>100||!Number.isSafeInteger(revision)||revision<=0||
  project.schemaVersion!==1||project.assets.length>25)
  throw new Error("Invalid draft recovery snapshot.");
 const record:RecoveryRecord={id,revision,project,updatedAt:new Date().toISOString()};
 let written=false;
 await operation("readwrite",store=>{
  store.get(id).onsuccess=event=>{
   const previous=(event.target as IDBRequest<RecoveryRecord|undefined>).result;
   if(valid(previous)&&previous.revision>=revision)return;
   store.put(record);written=true;
  };
 },()=>undefined);
 return written;
}
export async function discardRecoverableDraft(id:string):Promise<void>{
 await operation("readwrite",store=>{store.delete(id);},()=>undefined);
}
/** Unit-testable strict version gate for recovery records. */
export const validRecoveryRecord=valid;
