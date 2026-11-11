import type {LayoutOptions,Placement,PrintItemSpec,SheetPage} from "../../../domain/models/sheet.ts";
import {shapePolygonMm} from "../../../core/cropShapes.ts";
import type {ShapePoint} from "../../../core/cropShapes.ts";
import {UniformSpatialGrid2D} from "../../../domain/geometry/spatialGrid.ts";
import {polygonsConflict} from "./placementGeometry.ts";
export {polygonsConflict} from "./placementGeometry.ts";

/** Deterministic, bounded contour nesting. No server or external API.
 * Uses exact polygon intersections and segment-to-segment clearance tests.
 * A bounded grid of placement candidates permits interlocking shapes.
 * This is a heuristic, not proof of globally optimal packing.
 */
const EPS=1e-6;
const MAX_SHAPED_COPIES=1000;
const valid=(v:number)=>Number.isFinite(v)&&v>0;
type CachedContour={placement:Placement; polygon:ShapePoint[]};
type PageState={
  spatial:UniformSpatialGrid2D<CachedContour>;
  usedArea:number;
  /** One contour area per unchanged design within this sheet. */
  areaByDesign:Map<string,number>;
  // Rejected positions never become free when a job only adds placements.
  // Cursors are keyed per design and orientation, preserving first-fit order.
  nextCandidate:Map<string,number>;
  candidateGrids:Map<string,{xs:number[];ys:number[]}>;
  rejectedAnchors:Map<string,Set<string>>;
};

/** Compute the true contour area once per candidate, never per grid position. */
function contourArea(shape:PrintItemSpec["cropShape"],width:number,height:number):number{
  const polygon=shapePolygonMm(shape,0,0,width,height);
  return Math.abs(polygon.reduce((sum,p,i)=>{
    const next=polygon[(i+1)%polygon.length];
    return sum+p.x*next.y-next.x*p.y;
  },0))/2;
}

/** Query only geometrically nearby copies while retaining exact polygon tests. */
function shapeFits(spatial:UniformSpatialGrid2D<CachedContour>,spec:PrintItemSpec,
 x:number,y:number,w:number,h:number,rotate:boolean,gap:number):boolean{
  let candidatePoly:ShapePoint[]|null=null;
  const near=spatial.queryBox({
    minX:x-gap-EPS,minY:y-gap-EPS,maxX:x+w+gap+EPS,maxY:y+h+gap+EPS,
  });
  for(const {data:{placement:p,polygon:oldPolygon}} of near){
    // Keep the previous exact bounds predicate; the spatial grid is only a
    // broad phase and must never change physical clearance semantics.
    if(x+w+gap<=p.xMm+EPS||p.xMm+p.widthMm+gap<=x+EPS||
      y+h+gap<=p.yMm+EPS||p.yMm+p.heightMm+gap<=y+EPS)continue;
    if(!candidatePoly)candidatePoly=shapePolygonMm(spec.cropShape,x,y,w,h,rotate);
    if(polygonsConflict(candidatePoly,oldPolygon,gap))return false;
  }
  return true;
}

/** An exact item+gap lattice is indispensable: coarse steps cannot represent
 * e.g. 40mm rounded rectangles spaced by 3mm on a 5mm search grid. */
function axisCandidates(start:number,end:number,pitch:number,step:number):number[]{
  const values:number[]=[start,end];
  const collect=(delta:number)=>{
    if(!Number.isFinite(delta)||delta<=EPS)return;
    const count=Math.min(2000,Math.ceil((end-start)/delta));
    for(let i=1;i<count;i++){
      const position=start+i*delta;
      if(position<end-EPS)values.push(position);
    }
  };
  collect(pitch);
  collect(step);
  values.sort((a,b)=>a-b);
  return values.filter((v,i)=>i===0||v-values[i-1]>EPS);
}

/** Refine contour contact for interlocking shapes; an exact rectangle-bound
 * candidate remains available even if a refinement cannot be found. */
function tightenToContour(spec:PrintItemSpec,neighbor:Placement,
  xSafe:number,y:number,w:number,h:number,rotate:boolean,
  gap:number,minX:number):number{
  if(!isActualShaped(spec)||spec.cropShape==="rounded")return xSafe;
  const original=shapePolygonMm(neighbor.cropShape,neighbor.xMm,neighbor.yMm,
    neighbor.widthMm,neighbor.heightMm,!!neighbor.rotated);
  const allowed=Math.max(minX,neighbor.xMm-w+0.001);
  const increment=Math.max(0.5,Math.min(2,Math.min(w,h)/16));
  const conflicts=(x:number)=>polygonsConflict(original,
    shapePolygonMm(spec.cropShape,x,y,w,h,rotate),gap);
  let safe=xSafe;
  for(let i=0;i<10;i++){
    const trial=Math.max(allowed,safe-increment);
    if(trial>=safe-EPS)break;
    if(conflicts(trial)){
      let blocked=trial;
      for(let j=0;j<10;j++){
        const middle=(blocked+safe)/2;
        if(conflicts(middle))blocked=middle;
        else safe=middle;
      }
      break;
    }
    safe=trial;
  }
  return safe;
}

function placeOne(page:Placement[],spec:PrintItemSpec,copyIndex:number,
 settings:LayoutOptions,cache:WeakMap<Placement[],PageState>):boolean{
  const {paperWidthMm:pw,paperHeightMm:ph,marginMm:m,gapMm:g}=settings;
  const rotations=settings.autoRotate&&spec.canRotate===true?[false,true]:[false];
  // A one-millimeter minimum avoids dropping miniature photo stickers from
  // otherwise available paper, while the total copy count remains bounded.
  const step=Math.max(1,Math.min(8,Math.min(spec.widthMm,spec.heightMm)/8));
  let state=cache.get(page);
  if(!state){
    // All pages begin empty and only placeOne mutates their placements.
    // A per-job cache cannot leak stale contours across distinct jobs.
    if(page.length)throw new Error("Shape cache cannot index an externally modified sheet.");
    state={
      spatial:new UniformSpatialGrid2D<CachedContour>(pw,ph),
      usedArea:0,
      areaByDesign:new Map(),
      nextCandidate:new Map(),
      candidateGrids:new Map(),
      rejectedAnchors:new Map(),
    };
    cache.set(page,state);
  }
  // Area is invariant under right-angle rotation. Maintain a running total,
  // rather than repeatedly recomputing the full page's contour areas.
  const printable=(pw-2*m)*(ph-2*m);
  let area=state.areaByDesign.get(spec.id);
  if(area===undefined){
    area=contourArea(spec.cropShape,spec.widthMm,spec.heightMm);
    state.areaByDesign.set(spec.id,area);
  }
  if(state.usedArea+area>printable+EPS)return false;

  for(const rotate of rotations){
    const w=rotate?spec.heightMm:spec.widthMm,h=rotate?spec.widthMm:spec.heightMm;
    if(w>pw-2*m+EPS||h>ph-2*m+EPS)continue;
    const key=spec.id+(rotate?":rotated":":normal");
    const xMax=pw-m-w,yMax=ph-m-h;
    const commit=(x:number,y:number):boolean=>{
      const placement:Placement={itemId:spec.id,copyIndex,xMm:x,yMm:y,
        widthMm:w,heightMm:h,cropShape:spec.cropShape,...(rotate?{rotated:true}:{})};
      page.push(placement);
      state!.usedArea+=area;
      state!.spatial.insert({
        id:String(page.length),
        bounds:{minX:x,minY:y,maxX:x+w,maxY:y+h},
        data:{placement,polygon:shapePolygonMm(spec.cropShape,x,y,w,h,rotate)},
      });
      return true;
    };
    // Neighbor-bound exact anchors solve the horizontal/vertical gap for
    // mixed dimensions as well as equal-size designs. Rejecting a position is
    // monotone as copies are only added; avoid reconsidering failed anchors.
    const anchors:{x:number;y:number}[]=[{x:m,y:m}];
    for(const p of page){
      anchors.push(
        {x:p.xMm+p.widthMm+g,y:p.yMm},
        {x:p.xMm,y:p.yMm+p.heightMm+g},
        {x:p.xMm+p.widthMm+g,y:p.yMm+p.heightMm-h},
        {x:p.xMm+p.widthMm+g,y:p.yMm+(p.heightMm-h)/2},
        {x:p.xMm+p.widthMm-w,y:p.yMm+p.heightMm+g}
      );
    }
    // Contour refinement is a bounded optimization, not a prerequisite for
    // correctness. Ordered mode retains straightforward predictable packing.
    if(settings.packing==="optimized"&&isActualShaped(spec)){
      const nearby=page.slice(-4);
      for(const p of nearby){
        const y=p.yMm;
        const xSafe=p.xMm+p.widthMm+g;
        if(xSafe<=xMax+EPS&&y>=m-EPS&&y<=yMax+EPS){
          const tight=tightenToContour(spec,p,xSafe,y,w,h,rotate,g,m);
          if(tight<xSafe-EPS)anchors.push({x:tight,y});
        }
      }
    }
    anchors.sort((a,b)=>a.y-b.y||a.x-b.x);
    let rejected=state.rejectedAnchors.get(key);
    if(!rejected){rejected=new Set();state.rejectedAnchors.set(key,rejected);}
    const seen=new Set<string>();
    for(const {x,y} of anchors){
      if(x<m-EPS||y<m-EPS||x>xMax+EPS||y>yMax+EPS)continue;
      const hash=x.toFixed(5)+":"+y.toFixed(5);
      if(seen.has(hash)||rejected.has(hash))continue;
      seen.add(hash);
      if(shapeFits(state.spatial,spec,x,y,w,h,rotate,g))return commit(x,y);
      if(rejected.size<12000)rejected.add(hash);
    }
    // Coarse contours remain a bounded fallback for otherwise unrepresented
    // nesting pockets. Include exact size+gap lattice axes in the search.
    let grid=state.candidateGrids.get(key);
    if(!grid){
      grid={
        xs:axisCandidates(m,xMax,w+g,step),
        ys:axisCandidates(m,yMax,h+g,step),
      };
      state.candidateGrids.set(key,grid);
    }
    const {xs,ys}=grid;
    const count=xs.length*ys.length;
    const scanLimit=Math.min(count,Math.max(12000,Math.min(30000,page.length*300)));
    const begin=state.nextCandidate.get(key)??0;
    for(let candidate=begin;candidate<Math.min(count,begin+scanLimit);candidate++){
      const y=ys[Math.floor(candidate/xs.length)];
      const x=xs[candidate%xs.length];
      if(shapeFits(state.spatial,spec,x,y,w,h,rotate,g)){
        state.nextCandidate.set(key,candidate+1);
        return commit(x,y);
      }
    }
    // All attempted coordinates remain impossible after further insertions.
    state.nextCandidate.set(key,Math.min(count,begin+scanLimit));
  }
  return false;
}
export function composeShapeSheets(items:ReadonlyArray<PrintItemSpec>,settings:LayoutOptions):SheetPage[]{
  const {paperWidthMm:pw,paperHeightMm:ph,marginMm:m,gapMm:g}=settings;
  if(!valid(pw)||!valid(ph)||!Number.isFinite(m)||m<0||
    !Number.isFinite(g)||g<0||pw<=2*m||ph<=2*m)
    throw new Error("Invalid paper margins or dimensions for shape nesting.");
  const total=items.reduce((s,i)=>s+i.quantity,0);
  if(total>MAX_SHAPED_COPIES)throw new Error(
    "Shape-aware nesting is limited to 1,000 copies per job. Split this batch.");
  const ids=new Set<string>();
  for(const item of items){
    if(!item.id||ids.has(item.id)||item.id.length>200||
      !valid(item.widthMm)||!valid(item.heightMm)||
      !Number.isSafeInteger(item.quantity)||item.quantity<1)
      throw new Error("Shape nesting requires unique IDs and positive dimensions/quantities.");
    if(item.widthMm>pw-2*m+EPS||item.heightMm>ph-2*m+EPS){
      if(!settings.autoRotate||!item.canRotate||
        item.heightMm>pw-2*m+EPS||item.widthMm>ph-2*m+EPS)
        throw new Error("A shaped item is larger than the available printable area.");
    }
    ids.add(item.id);
  }
  // One repeated shaped design yields the same deterministic arrangement on
  // each fresh sheet. Solve the first sheet once; reuse its exact contour layout
  // and give every later placement a fresh, unique copy index.
  if(items.length===1&&total>=60){
    const item=items[0],template:Placement[]=[];
    const templateCache=new WeakMap<Placement[],PageState>();
    for(let index=0;index<item.quantity;index++){
      if(!placeOne(template,item,index,settings,templateCache))break;
    }
    if(!template.length)throw new Error("This shape cannot fit on the selected paper.");
    const perSheet=template.length;
    const count=Math.ceil(item.quantity/perSheet);
    if(count>200)throw new Error("This job exceeds 200 print sheets.");
    return Array.from({length:count},(_,sheet)=>({
      placements:template.slice(0,Math.min(perSheet,item.quantity-sheet*perSheet))
        .map((p,slot)=>({...p,copyIndex:sheet*perSheet+slot})),
    }));
  }
  const caches=new WeakMap<Placement[],PageState>();
  const copies=items.flatMap(i=>Array.from({length:i.quantity},(_,n)=>({item:i,copyIndex:n})));
  if(settings.packing!=="ordered")
    copies.sort((a,b)=>b.item.widthMm*b.item.heightMm-a.item.widthMm*a.item.heightMm||
      a.item.id.localeCompare(b.item.id)||a.copyIndex-b.copyIndex);
  const pages:SheetPage[]=[];
  // Ordered mode must never backfill an earlier sheet after a subsequent
  // design begins. Otherwise a tighter layout reorders the flattened output,
  // which also breaks deterministic image-assignment sequences.
  let earliestOrderedPage=0;
  let previousOrderedId:string|undefined;
  for(const {item,copyIndex} of copies){
    if(settings.packing==="ordered"&&item.id!==previousOrderedId){
      earliestOrderedPage=Math.max(0,pages.length-1);
      previousOrderedId=item.id;
    }
    let placed=false;
    // Optimized packing can backfill earlier pages; ordered packing searches
    // only from the current design's first eligible sheet onward.
    const from=settings.packing==="ordered"?earliestOrderedPage:0;
    for(let i=from;i<pages.length;i++){
      if(placeOne(pages[i].placements,item,copyIndex,settings,caches)){placed=true;break;}
    }
    if(placed)continue;
    if(pages.length>=200)throw new Error("This job exceeds 200 print sheets.");
    const next:SheetPage={placements:[]};
    if(!placeOne(next.placements,item,copyIndex,settings,caches))
      throw new Error("This shape cannot fit on the selected paper.");
    pages.push(next);
  }
  return pages;
}
/** Maximum same-shape copies on ONE sheet. Bound the search for mobile devices. */
export function maximumShapeCopies(spec:PrintItemSpec,settings:LayoutOptions):number{
  const cache=new WeakMap<Placement[],PageState>(),page:Placement[]=[];
  for(let index=0;index<MAX_SHAPED_COPIES;index++){
    if(!placeOne(page,spec,index,settings,cache))break;
  }
  if(page.length===0)throw new Error("Selected shape does not fit the printable sheet.");
  return page.length;
}
export function placementShapePolygon(spec:PrintItemSpec,p:Placement):ShapePoint[]{
  return shapePolygonMm(spec.cropShape,p.xMm,p.yMm,p.widthMm,p.heightMm,!!p.rotated);
}
export function isActualShaped(spec:PrintItemSpec):boolean{
  return !!spec.cropShape&&spec.cropShape!=="rectangle";
}
