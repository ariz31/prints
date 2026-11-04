import type {PhotoAsset} from "./exportPdf.ts";
import type {PrintModeConfig} from "./printModes.ts";

export interface ModeImageAssignment {
 selected:PhotoAsset[];
 sequence:PhotoAsset[];
 quantities:Map<string,number>;
 total:number;
 /** Includes intentional exclusions as well as designs with no allocated copies. */
 excluded:{id:string;name:string;reason:"not-selected"|"no-copies"}[];
}

/** Pure, deterministic assignment planner. Does not touch original image Blobs. */
export function resolveModeImageAssignments(source:readonly PhotoAsset[],config:PrintModeConfig):ModeImageAssignment{
 const byId=new Map(source.map(a=>[a.id,a]));
 let selected:PhotoAsset[];
 if(config.mode==="notepad"&&config.imageAssignment==="slots")
   throw new Error("Notepad cutting does not support ticket slot assignments.");
 if(config.imageAssignment==="first"){
   const first=config.selectedImageId?byId.get(config.selectedImageId):source[0];
   if(config.selectedImageId&&!first)
     throw new Error("The selected print image is missing. Choose a current image on the Images tab.");
   selected=first?[first]:[];
 }else if(config.imageAssignment==="selected"){
   const ids=config.includedImageIds??[];
   const missing=ids.filter(id=>!byId.has(id));
   if(missing.length)throw new Error("A selected print image is missing. Review image assignments before printing.");
   selected=source.filter(a=>ids.includes(a.id));
 }else if(config.imageAssignment==="slots"){
   const first=config.selectedImageId?byId.get(config.selectedImageId):source[0];
   if(config.selectedImageId&&!first)
     throw new Error("The selected print image is missing. Choose a current image on the Images tab.");
   const missing=config.slotImageIds.find(id=>id&&!byId.has(id));
   if(missing)throw new Error("Ticket position "+
     (config.slotImageIds.indexOf(missing)+1)+" references an unavailable image. Reassign that position on the Images tab.");
   selected=source.filter(a=>a.id===first?.id||config.slotImageIds.includes(a.id));
 }else selected=[...source];
 if(!selected.length&&source.length)throw new Error("Select at least one design for this print job.");
 if(config.quantityBasis==="per-design"&&config.imageAssignment==="slots")
   throw new Error("Per-design quantities cannot be combined with fixed ticket cutting positions.");
 const quantities=new Map<string,number>();
 let sequence:PhotoAsset[]=[];
 if(config.imageAssignment==="slots"){
   // Slots may repeat the same source. Exact usage is determined by the
   // ticket composer, not guessed from the set of selected designs.
   sequence=Array.from({length:config.quantity},()=>selected[0]??source[0]);
 }else if(config.quantityBasis==="per-design"){
   for(const item of selected)quantities.set(item.id,config.perImageQuantities?.[item.id]??1);
   const remaining=new Map(quantities);
   while([...remaining.values()].some(q=>q>0)){
     for(const item of selected){
       const n=remaining.get(item.id)??0;
       if(n>0){sequence.push(item);remaining.set(item.id,n-1);}
       if(sequence.length>1000)throw new Error("This print job exceeds 1,000 finished pieces.");
     }
   }
 }else{
   sequence=Array.from({length:config.quantity},(_,i)=>selected[i%selected.length]);
 }
 if(config.imageAssignment!=="slots"&&config.quantityBasis!=="per-design"){
   for(const item of sequence)quantities.set(item.id,(quantities.get(item.id)??0)+1);
 }
 const printedIds=new Set(sequence.map(x=>x.id));
 const excluded=source.filter(a=>!printedIds.has(a.id)).map(a=>({
   id:a.id,name:a.name,
   reason:(selected.some(x=>x.id===a.id)?"no-copies":"not-selected") as "no-copies"|"not-selected",
 }));
 return {selected,sequence,quantities,total:sequence.length,excluded};
}

export function inspectModeImageCoverage(source:readonly PhotoAsset[],config:PrintModeConfig,
 job:{pages:readonly {placements:readonly {itemId:string}[]}[]} | null){
 const printed=new Set(job?.pages.flatMap(page=>page.placements.map(p=>p.itemId))??[]);
 const included=config.imageAssignment==="cycle"
   ?new Set(source.map(a=>a.id))
   :config.imageAssignment==="selected"?new Set(config.includedImageIds??[])
   :config.imageAssignment==="slots"
     ?new Set([config.selectedImageId||source[0]?.id??"",...config.slotImageIds])
     :new Set([config.selectedImageId||source[0]?.id??""]);
 const omitted=source.filter(a=>!printed.has(a.id)).map(a=>({
   id:a.id,name:a.name,
   reason:!included.has(a.id)?"not-selected" as const:"insufficient-quantity" as const,
 }));
 return {
   uploaded:source.length,included:source.filter(a=>included.has(a.id)).length,
   printed:printed.size,omitted,
   unintended:omitted.filter(a=>a.reason==="insufficient-quantity"),
 };
}
