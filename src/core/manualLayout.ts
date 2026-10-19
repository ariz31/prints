import type {LayoutOptions,SheetPage} from "./layout.ts";

/**
 * User-defined millimeter positions are overlaid on the deterministic automatic
 * arrangement. Each override is bound to one item copy on one unchanged sheet.
 */
export interface ManualPlacement {
  itemId:string;copyIndex:number;pageIndex:number;xMm:number;yMm:number;
}
const EPS=1e-7;
const key=(itemId:string,copyIndex:number)=>JSON.stringify([itemId,copyIndex]);
export function validManualPlacements(value:unknown):value is ManualPlacement[]{
  if(!Array.isArray(value)||value.length>1000)return false;
  const seen=new Set<string>();
  return value.every(raw=>{
    if(!raw||typeof raw!=="object")return false;
    const x=raw as Record<string,unknown>;
    if(typeof x.itemId!=="string"||x.itemId.length<1||x.itemId.length>200||
      !Number.isSafeInteger(x.copyIndex)||(x.copyIndex as number)<0||
      !Number.isSafeInteger(x.pageIndex)||(x.pageIndex as number)<0||
      (x.pageIndex as number)>=200||
      typeof x.xMm!=="number"||!Number.isFinite(x.xMm)||
      typeof x.yMm!=="number"||!Number.isFinite(x.yMm)||x.xMm<0||x.yMm<0)return false;
    const k=key(x.itemId,x.copyIndex as number);
    if(seen.has(k))return false;
    seen.add(k);
    return true;
  });
}
export function applyManualPlacements(
  original:ReadonlyArray<SheetPage>,
  overrides:readonly ManualPlacement[],
  paper:LayoutOptions,
):SheetPage[]{
  if(!validManualPlacements(overrides))throw new Error("Invalid manual sheet positions. Reset arrangement.");
  if(!overrides.length)return original.map(page=>({placements:[...page.placements]}));
  const base=new Map<string,number>();
  original.forEach((page,i)=>page.placements.forEach(p=>base.set(key(p.itemId,p.copyIndex),i)));
  const positions=new Map<string,ManualPlacement>();
  for(const override of overrides){
    const k=key(override.itemId,override.copyIndex);
    if(base.get(k)!==override.pageIndex){
      throw new Error("Print layout changed since manual positioning. Reset arrangement.");
    }
    positions.set(k,override);
  }
  const pages=original.map(page=>({placements:page.placements.map(p=>{
    const found=positions.get(key(p.itemId,p.copyIndex));
    return found?{...p,xMm:found.xMm,yMm:found.yMm}:p;
  })}));
  for(const page of pages){
    for(let i=0;i<page.placements.length;i++){
      const a=page.placements[i];
      if(a.xMm<paper.marginMm-EPS||a.yMm<paper.marginMm-EPS||
        a.xMm+a.widthMm>paper.paperWidthMm-paper.marginMm+EPS||
        a.yMm+a.heightMm>paper.paperHeightMm-paper.marginMm+EPS)
        throw new Error("Item is outside printable margins. Move it back inside the sheet.");
      for(let j=i+1;j<page.placements.length;j++){
        const b=page.placements[j],g=paper.gapMm;
        const disjoint=a.xMm+a.widthMm+g<=b.xMm+EPS||
          b.xMm+b.widthMm+g<=a.xMm+EPS||
          a.yMm+a.heightMm+g<=b.yMm+EPS||
          b.yMm+b.heightMm+g<=a.yMm+EPS;
        if(!disjoint)throw new Error("Items overlap or violate spacing. Leave more room between them.");
      }
    }
  }
  return pages;
}
export function moveManualPlacement(
 original:ReadonlyArray<SheetPage>, overrides:readonly ManualPlacement[],
 paper:LayoutOptions, pageIndex:number,itemId:string,copyIndex:number,
 xMm:number,yMm:number,
):ManualPlacement[]{
  if(!Number.isInteger(pageIndex)||!Number.isInteger(copyIndex)||
    !Number.isFinite(xMm)||!Number.isFinite(yMm))
    throw new Error("Invalid placement coordinates.");
  const item=original[pageIndex]?.placements.find(p=>p.itemId===itemId&&p.copyIndex===copyIndex);
  if(!item)throw new Error("The selected item was moved by automatic packing. Reset arrangement.");
  const k=key(itemId,copyIndex);
  const next=overrides.filter(p=>key(p.itemId,p.copyIndex)!==k);
  next.push({itemId,copyIndex,pageIndex,xMm:Math.round(xMm*1000)/1000,
    yMm:Math.round(yMm*1000)/1000});
  applyManualPlacements(original,next,paper);
  return next;
}
