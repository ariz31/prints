import type {LayoutOptions,Placement,PrintItemSpec,SheetPage} from "../../../domain/models/sheet.ts";
import {shapePolygonMm} from "../../../core/cropShapes.ts";
import type {ShapePoint} from "../../../core/cropShapes.ts";
import {UniformSpatialGrid2D} from "../../../domain/geometry/spatialGrid.ts";

/** Deterministic, bounded contour nesting. No server or external API.
 * Uses exact polygon intersections and segment-to-segment clearance tests.
 * A bounded grid of placement candidates permits interlocking shapes.
 * This is a heuristic, not proof of globally optimal packing.
 */
const EPS=1e-6;
const MAX_SHAPED_COPIES=200;
const cross=(a:ShapePoint,b:ShapePoint,c:ShapePoint)=>
  (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function onEdge(p:ShapePoint,a:ShapePoint,b:ShapePoint):boolean{
  return Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&
    p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&
    p.y<=Math.max(a.y,b.y)+EPS;
}
function contains(poly:readonly ShapePoint[],p:ShapePoint):boolean{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[j],b=poly[i];
    if(onEdge(p,a,b))return false;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<
      (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function segmentCross(a:ShapePoint,b:ShapePoint,c:ShapePoint,d:ShapePoint):boolean{
  const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
  return ab1*ab2<-EPS&&cd1*cd2<-EPS;
}
function pointSegmentDistance(p:ShapePoint,a:ShapePoint,b:ShapePoint):number{
  const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  const t=len>0?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function polygonsConflict(a:readonly ShapePoint[],b:readonly ShapePoint[],gap:number):boolean{
  let minAx=Infinity,maxAx=-Infinity,minAy=Infinity,maxAy=-Infinity;
  for(let i=0;i<a.length;i++){
    const p=a[i];
    if(p.x<minAx)minAx=p.x;if(p.x>maxAx)maxAx=p.x;
    if(p.y<minAy)minAy=p.y;if(p.y>maxAy)maxAy=p.y;
  }
  let minBx=Infinity,maxBx=-Infinity,minBy=Infinity,maxBy=-Infinity;
  for(let i=0;i<b.length;i++){
    const p=b[i];
    if(p.x<minBx)minBx=p.x;if(p.x>maxBx)maxBx=p.x;
    if(p.y<minBy)minBy=p.y;if(p.y>maxBy)maxBy=p.y;
  }
  if(maxAx+gap<=minBx+EPS||
     maxBx+gap<=minAx+EPS||
     maxAy+gap<=minBy+EPS||
     maxBy+gap<=minAy+EPS)return false;
  if(a.some(p=>contains(b,p))||b.some(p=>contains(a,p)))return true;
  for(let i=0;i<a.length;i++){
    const a0=a[i],a1=a[(i+1)%a.length];
    for(let j=0;j<b.length;j++){
      const b0=b[j],b1=b[(j+1)%b.length];
      if(segmentCross(a0,a1,b0,b1))return true;
      if(gap>0&&Math.min(pointSegmentDistance(a0,b0,b1),
        pointSegmentDistance(a1,b0,b1),pointSegmentDistance(b0,a0,a1),
        pointSegmentDistance(b1,a0,a1))<gap-EPS)return true;
    }
  }
  // Proper-edge tests alone miss coincident polygons and shared collinear
  // boundaries. Probe a point just inside each directed edge to reject true
  // interior overlap while continuing to allow mere edge contact at gap=0.
  const interiorProbe=(source:readonly ShapePoint[],target:readonly ShapePoint[]):boolean=>{
    const signed=source.reduce((sum,p,i)=>{
      const q=source[(i+1)%source.length];return sum+p.x*q.y-q.x*p.y;
    },0);
    const dir=signed>=0?1:-1;
    for(let i=0;i<source.length;i++){
      const p=source[i],q=source[(i+1)%source.length];
      const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);
      if(len<EPS)continue;
      // Near-end probes catch shared-vertex crossing wedges; midpoint probes
      // catch fully coincident and collinearly overlapped contours.
      for(const t of [.001,.5,.999]){
        const d=Math.min(0.0001,len*0.001);
        const interior={x:p.x+dx*t-dir*dy/len*d,
          y:p.y+dy*t+dir*dx/len*d};
        if(contains(source,interior)&&contains(target,interior))return true;
      }
    }
    return false;
  };
  return interiorProbe(a,b)||interiorProbe(b,a);
}
const valid=(v:number)=>Number.isFinite(v)&&v>0;
type CachedContour={placement:Placement; polygon:ShapePoint[]};
type PageState={spatial:UniformSpatialGrid2D<CachedContour>;usedArea:number};

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
    state={spatial:new UniformSpatialGrid2D<CachedContour>(pw,ph),usedArea:0};
    cache.set(page,state);
  }
  // Area is invariant under right-angle rotation. Maintain a running total,
  // rather than repeatedly recomputing the full page's contour areas.
  const printable=(pw-2*m)*(ph-2*m);
  const area=contourArea(spec.cropShape,spec.widthMm,spec.heightMm);
  if(state.usedArea+area>printable+EPS)return false;
  for(const rotate of rotations){
    const w=rotate?spec.heightMm:spec.widthMm,h=rotate?spec.widthMm:spec.heightMm;
    if(w>pw-2*m+EPS||h>ph-2*m+EPS)continue;
    const xMax=pw-m-w,yMax=ph-m-h;
    // The last coordinate is always evaluated, including exact edge fits.
    const ys:number[]=[];
    for(let y=m;y<yMax-EPS;y+=step)ys.push(y);
    ys.push(yMax);
    const xs:number[]=[];
    for(let x=m;x<xMax-EPS;x+=step)xs.push(x);
    xs.push(xMax);
    for(const y of ys)for(const x of xs){
      if(shapeFits(state.spatial,spec,x,y,w,h,rotate,g)){
        const placement:Placement={itemId:spec.id,copyIndex,xMm:x,yMm:y,
          widthMm:w,heightMm:h,cropShape:spec.cropShape,...(rotate?{rotated:true}:{})};
        page.push(placement);
        state.usedArea+=area;
        state.spatial.insert({
          id:String(page.length),
          bounds:{minX:x,minY:y,maxX:x+w,maxY:y+h},
          data:{placement,polygon:shapePolygonMm(spec.cropShape,x,y,w,h,rotate)},
        });
        return true;
      }
    }
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
    "Shape-aware nesting is limited to 200 copies per job for reliable local performance. Split this batch.");
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
  for(const {item,copyIndex} of copies){
    let placed=false;
    // Earlier sheets may contain usable contour pockets for mixed-size jobs.
    for(const page of pages){
      if(placeOne(page.placements,item,copyIndex,settings,caches)){placed=true;break;}
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
