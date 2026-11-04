import type {LayoutOptions,Placement,PrintItemSpec,SheetPage} from "./layout.ts";
import {shapePolygonMm} from "./cropShapes.ts";
import type {ShapePoint} from "./cropShapes.ts";

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
  const ax=a.map(p=>p.x),ay=a.map(p=>p.y),bx=b.map(p=>p.x),by=b.map(p=>p.y);
  if(Math.max(...ax)+gap<=Math.min(...bx)+EPS||
     Math.max(...bx)+gap<=Math.min(...ax)+EPS||
     Math.max(...ay)+gap<=Math.min(...by)+EPS||
     Math.max(...by)+gap<=Math.min(...ay)+EPS)return false;
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
      const d=Math.min(0.0001,len*0.001);
      const interior={x:(p.x+q.x)/2-dir*dy/len*d,
        y:(p.y+q.y)/2+dir*dx/len*d};
      if(contains(source,interior)&&contains(target,interior))return true;
    }
    return false;
  };
  return interiorProbe(a,b)||interiorProbe(b,a);
}
const valid=(v:number)=>Number.isFinite(v)&&v>0;
type CachedContour={placement:Placement; polygon:ShapePoint[]};
function shapeFits(placed:readonly CachedContour[],spec:PrintItemSpec,
 x:number,y:number,w:number,h:number,rotate:boolean,gap:number):boolean{
  const poly=shapePolygonMm(spec.cropShape,x,y,w,h,rotate);
  for(const {placement:p,polygon:oldPolygon} of placed){
    // Cheap expanded-bounds rejection before polygon tests.
    if(x+w+gap<=p.xMm+EPS||p.xMm+p.widthMm+gap<=x+EPS||
      y+h+gap<=p.yMm+EPS||p.yMm+p.heightMm+gap<=y+EPS)continue;
    if(polygonsConflict(poly,oldPolygon,gap))return false;
  }
  return true;
}
function placeOne(page:Placement[],spec:PrintItemSpec,copyIndex:number,
 settings:LayoutOptions,specs:ReadonlyMap<string,PrintItemSpec>):boolean{
  const {paperWidthMm:pw,paperHeightMm:ph,marginMm:m,gapMm:g}=settings;
  const rotations=settings.autoRotate&&spec.canRotate===true?[false,true]:[false];
  // A one-millimeter minimum avoids dropping miniature photo stickers from
  // otherwise available paper, while the total copy count remains bounded.
  const step=Math.max(1,Math.min(8,Math.min(spec.widthMm,spec.heightMm)/8));
  const prior:CachedContour[]=page.map(placement=>{
    const item=specs.get(placement.itemId);
    if(!item)throw new Error("Shape nesting references a missing design.");
    return {placement,polygon:shapePolygonMm(item.cropShape,
      placement.xMm,placement.yMm,placement.widthMm,placement.heightMm,!!placement.rotated)};
  });
  // Safe lower bound: no set of non-overlapping cutouts can exceed printable
  // area, even when their enclosing rectangles interlock.
  const area=(w:number,h:number,shape:PrintItemSpec["cropShape"])=>{
    const poly=shapePolygonMm(shape,0,0,w,h);
    return Math.abs(poly.reduce((sum,p,i)=>{
      const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;
    },0))/2;
  };
  const printable=(pw-2*m)*(ph-2*m);
  const used=prior.reduce((sum,p)=>sum+area(p.placement.widthMm,p.placement.heightMm,
    specs.get(p.placement.itemId)!.cropShape),0);
  if(used+area(spec.widthMm,spec.heightMm,spec.cropShape)>printable+EPS)return false;
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
      if(shapeFits(prior,spec,x,y,w,h,rotate,g)){
        page.push({itemId:spec.id,copyIndex,xMm:x,yMm:y,
          widthMm:w,heightMm:h,cropShape:spec.cropShape,...(rotate?{rotated:true}:{})});
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
  const byId=new Map(items.map(i=>[i.id,i]));
  const copies=items.flatMap(i=>Array.from({length:i.quantity},(_,n)=>({item:i,copyIndex:n})));
  if(settings.packing!=="ordered")
    copies.sort((a,b)=>b.item.widthMm*b.item.heightMm-a.item.widthMm*a.item.heightMm||
      a.item.id.localeCompare(b.item.id)||a.copyIndex-b.copyIndex);
  const pages:SheetPage[]=[];
  for(const {item,copyIndex} of copies){
    let placed=false;
    // Earlier sheets may contain usable contour pockets for mixed-size jobs.
    for(const page of pages){
      if(placeOne(page.placements,item,copyIndex,settings,byId)){placed=true;break;}
    }
    if(placed)continue;
    if(pages.length>=200)throw new Error("This job exceeds 200 print sheets.");
    const next:SheetPage={placements:[]};
    if(!placeOne(next.placements,item,copyIndex,settings,byId))
      throw new Error("This shape cannot fit on the selected paper.");
    pages.push(next);
  }
  return pages;
}
/** Maximum same-shape copies on ONE sheet. Bound the search for mobile devices. */
export function maximumShapeCopies(spec:PrintItemSpec,settings:LayoutOptions):number{
  const refs=new Map([[spec.id,spec]]),page:Placement[]=[];
  for(let index=0;index<MAX_SHAPED_COPIES;index++){
    if(!placeOne(page,spec,index,settings,refs))break;
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
