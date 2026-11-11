import type {LayoutOptions,SheetPage} from "./layout.ts";
import {placementsConflict} from "./placementGeometry.ts";
import {UniformSpatialGrid2D} from "../../../domain/geometry/spatialGrid.ts";

/**
 * User-defined millimeter positions are overlaid on the deterministic automatic
 * arrangement. Each override is bound to one item copy on one unchanged sheet.
 */
export interface ManualPlacement {
  itemId:string;copyIndex:number;pageIndex:number;xMm:number;yMm:number;rotated?:boolean;
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
      typeof x.yMm!=="number"||!Number.isFinite(x.yMm)||x.xMm<0||x.yMm<0||
      (x.rotated!==undefined&&typeof x.rotated!=="boolean"))return false;
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
    if(!found)return p;
    const rotated=found.rotated??p.rotated??false;
    const swap=rotated!==(p.rotated??false);
    return {...p,xMm:found.xMm,yMm:found.yMm,rotated,
      widthMm:swap?p.heightMm:p.widthMm,heightMm:swap?p.widthMm:p.heightMm};
  })}));
  for(const page of pages){
    const grid=new UniformSpatialGrid2D<typeof page.placements[0]>(paper.paperWidthMm,paper.paperHeightMm);
    const g=paper.gapMm;
    for(let i=0;i<page.placements.length;i++){
      const a=page.placements[i];
      if(a.xMm<paper.marginMm-EPS||a.yMm<paper.marginMm-EPS||
        a.xMm+a.widthMm>paper.paperWidthMm-paper.marginMm+EPS||
        a.yMm+a.heightMm>paper.paperHeightMm-paper.marginMm+EPS)
        throw new Error("Item is outside printable margins. Move it back inside the sheet.");
      const box={minX:a.xMm-g,minY:a.yMm-g,maxX:a.xMm+a.widthMm+g,maxY:a.yMm+a.heightMm+g};
      const neighbors=grid.queryBox(box);
      for(const {data:b} of neighbors){
        // Use the same exact clearance policy as automatic nesting. The
        // spatial grid only prunes distant copies; it never sets gap rules.
        if(placementsConflict(a,b,g))
          throw new Error("Items overlap or violate spacing. Leave more room between them.");
      }
      grid.insert({
        id:key(a.itemId,a.copyIndex),
        bounds:{minX:a.xMm,minY:a.yMm,maxX:a.xMm+a.widthMm,maxY:a.yMm+a.heightMm},
        data:a,
      });
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
  const prior=overrides.find(p=>key(p.itemId,p.copyIndex)===k);
  next.push({itemId,copyIndex,pageIndex,rotated:prior?.rotated,xMm:Math.round(xMm*1000)/1000,
    yMm:Math.round(yMm*1000)/1000});
  applyManualPlacements(original,next,paper);
  return next;
}

/** Quarter-turn only changes sheet placement, never the saved crop or source. */
export function rotateManualPlacement(original:ReadonlyArray<SheetPage>,overrides:readonly ManualPlacement[],
 paper:LayoutOptions,pageIndex:number,itemId:string,copyIndex:number):ManualPlacement[]{
 const placed=applyManualPlacements(original,overrides,paper)[pageIndex]?.placements.find(p=>p.itemId===itemId&&p.copyIndex===copyIndex);
 if(!placed)throw new Error("Select a copy before rotating.");
 const xMm=Math.max(paper.marginMm,Math.min(paper.paperWidthMm-paper.marginMm-placed.heightMm,placed.xMm+(placed.widthMm-placed.heightMm)/2));
 const yMm=Math.max(paper.marginMm,Math.min(paper.paperHeightMm-paper.marginMm-placed.widthMm,placed.yMm+(placed.heightMm-placed.widthMm)/2));
 const next=[...overrides.filter(p=>key(p.itemId,p.copyIndex)!==key(itemId,copyIndex)),
  {itemId,copyIndex,pageIndex,xMm,yMm,rotated:!placed.rotated}];
 applyManualPlacements(original,next,paper);
 return next;
}
