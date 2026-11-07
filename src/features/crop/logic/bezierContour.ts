import type {ShapePoint} from "../../../domain/models/crop.ts";
import {validCustomPolygon} from "./studioGeometry.ts";
export interface BezierHandles{in:ShapePoint;out:ShapePoint}
const inside=(p:ShapePoint)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&
 p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const lerp=(a:ShapePoint,b:ShapePoint,t:number):ShapePoint=>({
 x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
});
export function validBezierHandles(input:unknown,anchors:readonly ShapePoint[]):input is BezierHandles[]{
 if(!Array.isArray(input)||input.length!==anchors.length||input.length>128)return false;
 return input.every(h=>h&&typeof h==="object"&&!Array.isArray(h)&&
   h.in&&h.out&&inside(h.in)&&inside(h.out)&&
   Object.keys(h).length===2);
}
/** Catmull-derived default handles preserve one shape and permit concave curves.
 * Local output is clamped to the physical print frame. */
export function defaultBezierHandles(anchors:readonly ShapePoint[],tension=.18):BezierHandles[]{
 if(!validCustomPolygon(anchors))throw new Error("Invalid editable shape vertices.");
 if(!Number.isFinite(tension)||tension<0||tension>.5)throw new Error("Invalid curve tension.");
 const n=anchors.length;
 const clamp=(x:number)=>Math.min(1,Math.max(0,x));
 return anchors.map((p,i)=>{
   const prev=anchors[(i+n-1)%n],next=anchors[(i+1)%n];
   const dx=(next.x-prev.x)*tension/2,dy=(next.y-prev.y)*tension/2;
   return {in:{x:clamp(p.x-dx),y:clamp(p.y-dy)},
     out:{x:clamp(p.x+dx),y:clamp(p.y+dy)}};
 });
}
const bezier=(p0:ShapePoint,p1:ShapePoint,p2:ShapePoint,p3:ShapePoint,t:number):ShapePoint=>{
 const a=lerp(p0,p1,t),b=lerp(p1,p2,t),c=lerp(p2,p3,t);
 return lerp(lerp(a,b,t),lerp(b,c,t),t);
};
/** Shared flattening of the sole curve into an export-ready physical contour.
 * Segment density scales with output size and is capped for local memory.
 * No server processing. Reuses identical segments for masking/cut lines/packing. */
export function flattenBezierContour(
 anchors:readonly ShapePoint[],
 handles:readonly BezierHandles[]|undefined,
 curvature:number,
 outputWidthMm:number,
 outputHeightMm:number,
):ShapePoint[]{
 if(!validCustomPolygon(anchors))throw new Error("Invalid shape anchors.");
 if(!Number.isFinite(curvature)||curvature<0||curvature>.5)
   throw new Error("Invalid corner curvature.");
 if(![outputWidthMm,outputHeightMm].every(v=>Number.isFinite(v)&&v>0))
   throw new Error("Invalid physical contour dimensions.");
 if(handles!==undefined&&!validBezierHandles(handles,anchors))
   throw new Error("Invalid Bézier handles.");
 if(!handles&&curvature===0)return anchors.map(p=>({...p}));
 const computed=handles??defaultBezierHandles(anchors,curvature);
 const result:ShapePoint[]=[];
 const count=anchors.length;
 // Adaptive midpoint-deviation subdivision, not fixed pixel steps.
 // Target 0.1 mm chord error where possible, within a 1024-point safety cap.
 const maxPoints=1024;
 const maxPerEdge=Math.max(2,Math.floor(maxPoints/count));
 for(let i=0;i<count;i++){
   const j=(i+1)%count;
   const p0=anchors[i],p1=computed[i].out,p2=computed[j].in,p3=anchors[j];
   const segment:[{t:number;p:ShapePoint},{t:number;p:ShapePoint}] = [
     {t:0,p:p0},{t:1,p:p3},
   ];
   // Iterative left-to-right midpoint insertion; avoid recursion and unbounded growth.
   const sampled=[segment[0],segment[1]];
   let k=0;
   while(k<sampled.length-1){
     const a=sampled[k],b=sampled[k+1],mid=(a.t+b.t)/2;
     const point=bezier(p0,p1,p2,p3,mid);
     const chord=lerp(a.p,b.p,.5);
     const err=Math.hypot((point.x-chord.x)*outputWidthMm,
       (point.y-chord.y)*outputHeightMm);
     if(err>.10&&sampled.length-1<maxPerEdge){
       sampled.splice(k+1,0,{t:mid,p:point});
     }else k++;
   }
   for(const sample of sampled.slice(0,-1))result.push(sample.p);
 }
 // Fail-closed when a control handle produces self-crossing or outside geometry.
 if(!validCustomPolygon(result))throw new Error("Curved contour self-intersects or escapes the print boundary.");
 return result;
}
