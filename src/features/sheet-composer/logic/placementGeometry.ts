import type { Placement } from "../../../domain/models/sheet.ts";
import type { ShapePoint } from "../../../core/cropShapes.ts";
import { shapePolygonMm } from "../../../core/cropShapes.ts";

/** Single physical-clearance policy shared by automatic and manual placement. */
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

/** Gap is the minimum distance between printed cut contours, in millimeters.
 * Rectangles have a fast exact bounding-box path. Touching is valid at zero gap. */
export function placementsConflict(a:Placement,b:Placement,gap:number):boolean{
  if(!Number.isFinite(gap)||gap<0)throw new Error("Invalid physical spacing.");
  const disjoint=a.xMm+a.widthMm+gap<=b.xMm+EPS||
    b.xMm+b.widthMm+gap<=a.xMm+EPS||
    a.yMm+a.heightMm+gap<=b.yMm+EPS||
    b.yMm+b.heightMm+gap<=a.yMm+EPS;
  if(disjoint)return false;
  if((!a.cropShape||a.cropShape==="rectangle")&&
     (!b.cropShape||b.cropShape==="rectangle"))return true;
  return polygonsConflict(
    shapePolygonMm(a.cropShape,a.xMm,a.yMm,a.widthMm,a.heightMm,!!a.rotated),
    shapePolygonMm(b.cropShape,b.xMm,b.yMm,b.widthMm,b.heightMm,!!b.rotated),gap);
}
