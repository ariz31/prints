import type { CropStudioDocument } from "./studioDocument.ts";
import { createFrameGeometry } from "../../frames/logic/frames.ts";
import type { PhotoAdjustments } from "../../../domain/models/asset.ts";
import { hasGeometryTransform,rotationCoverScale } from "../../photo-editor/logic/photoAdjustments.ts";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = {x:number;y:number};
type ImageSource = HTMLImageElement | ImageBitmap;
type SourceRect = {sx:number;sy:number;sw:number;sh:number};
const rad=(deg:number)=>deg*Math.PI/180;
/** Canvas path with a consistent physical-mm corner radius on all devices. */
function framePath(ctx:Context,x:number,y:number,w:number,h:number,radius:number):void{
 const r=Math.max(0,Math.min(w/2,h/2,radius));
 ctx.beginPath();
 ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
 ctx.quadraticCurveTo(x+w,y,x+w,y+r);
 ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
 ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
 ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
 ctx.closePath();
}

const isIdentity=(doc:CropStudioDocument|undefined):boolean=>{
 if(!doc)return true;
 const i=doc.imageTransform,c=doc.cropTransform,f=doc.frame;
 return !i.rotationDeg&&!i.flipX&&!i.flipY&&!i.skewXDeg&&!i.skewYDeg&&!i.perspective&&
   !c.rotationDeg&&!c.flipX&&!c.flipY&&
   f.bounds.x===0&&f.bounds.y===0&&f.bounds.width===1&&f.bounds.height===1&&
   f.fit==="fill"&&!f.imageOffsetX&&!f.imageOffsetY&&f.imageScale===1;
};
export function hasStudioTransform(doc:CropStudioDocument|undefined):boolean{
 return !isIdentity(doc);
}
/** Exact quadrilateral homography mapping a unit square to the user's TL/TR/BR/BL.
 * The convex-quad validator rejects any near-zero denominator ahead of time. */
export function projectSquare(u:number,v:number,quad:readonly Point[]):Point{
 const [a,b,c,d]=quad;
 const dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
 const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
 const det=dx1*dy2-dx2*dy1;
 const g=Math.abs(dx3)+Math.abs(dy3)<1e-12?0:
   (dx3*dy2-dx2*dy3)/det;
 const h=Math.abs(dx3)+Math.abs(dy3)<1e-12?0:
   (dx1*dy3-dx3*dy1)/det;
 const x1=b.x-a.x+g*b.x,y1=b.y-a.y+g*b.y;
 const x2=d.x-a.x+h*d.x,y2=d.y-a.y+h*d.y;
 const den=g*u+h*v+1;
 if(!Number.isFinite(den)||Math.abs(den)<1e-8)throw new Error("Perspective exceeds the valid projective range.");
 return {x:(x1*u+x2*v+a.x)/den,y:(y1*u+y2*v+a.y)/den};
}
function transformPoint(u:number,v:number,W:number,H:number,doc:CropStudioDocument,
 adjustments?:PhotoAdjustments):Point{
 const i=doc.imageTransform,c=doc.cropTransform,f=doc.frame;
 // Separate crop and image transforms are composed, not copied into legacy
 // PhotoAdjustments. This prevents applying rotations/flips twice on export.
 let x=(u-.5)*W,y=(v-.5)*H;
 const rotate=(angle:number)=>{
   if(!angle)return;
   const cos=Math.cos(rad(angle)),sin=Math.sin(rad(angle));
   const old=x;x=x*cos-y*sin;y=old*sin+y*cos;
 };
 if(c.flipX)x=-x;
 if(c.flipY)y=-y;
 rotate(c.rotationDeg);
 if(i.flipX)x=-x;
 if(i.flipY)y=-y;
 const oldX=x;
 x+=Math.tan(rad(i.skewXDeg))*y;
 y+=Math.tan(rad(i.skewYDeg))*oldX;
 rotate(i.rotationDeg);
 if(adjustments?.flipX)x=-x;
 if(adjustments?.flipY)y=-y;
 const legacyAngle=(adjustments?.rotation??0)+(adjustments?.straighten??0);
 rotate(legacyAngle);
 if(hasGeometryTransform(adjustments)){
   const cover=rotationCoverScale(W,H,legacyAngle);
   x*=cover;y*=cover;
 }
 // Normalized result is transformed through perspective in the original physical
 // source aspect; unit-space homography keeps print size and mm coordinates fixed.
 let p={x:x/W+.5,y:y/H+.5};
 if(i.perspective)p=projectSquare(p.x,p.y,i.perspective);
 const extent=f.fit==="fit"?Math.min(f.bounds.width,f.bounds.height):
   Math.max(f.bounds.width,f.bounds.height);
 // Fill preserves coverage after independent rotation; Fit preserves
 // the complete source without inventing pixels at corners.
 const rotationCover=f.fit==="fill"
   ?rotationCoverScale(W,H,i.rotationDeg+c.rotationDeg):1;
 const scale=extent*f.imageScale*rotationCover;
 return {
   x:W*(f.bounds.x+f.bounds.width/2+f.imageOffsetX*f.bounds.width+(p.x-.5)*scale),
   y:H*(f.bounds.y+f.bounds.height/2+f.imageOffsetY*f.bounds.height+(p.y-.5)*scale),
 };
}
function affine(p0:Point,p1:Point,p2:Point,q0:Point,q1:Point,q2:Point){
 const ux=p1.x-p0.x,uy=p1.y-p0.y,vx=p2.x-p0.x,vy=p2.y-p0.y;
 const det=ux*vy-vx*uy;
 if(Math.abs(det)<1e-12)throw new Error("Degenerate perspective mesh.");
 const rx=q1.x-q0.x,ry=q1.y-q0.y,sx=q2.x-q0.x,sy=q2.y-q0.y;
 const a=(rx*vy-sx*uy)/det,c=(sx*ux-rx*vx)/det;
 const b=(ry*vy-sy*uy)/det,d=(sy*ux-ry*vx)/det;
 return {a,b,c,d,e:q0.x-a*p0.x-c*p0.y,f:q0.y-b*p0.x-d*p0.y};
}
/**
 * Shared normal/worker/tiled raster geometry. Existing adjustments retain
 * their exact legacy drawing path when the v2 model is absent. Advanced
 * projective warps use a bounded affine triangle mesh, clipping every triangle
 * to avoid transparent holes and restricting work to visible output tiles.
 */
export function drawStudioImage(
 ctx:Context,image:ImageSource,source:SourceRect,W:number,H:number,
 doc:CropStudioDocument,adjustments?:PhotoAdjustments,
 visible?:{x:number;y:number;width:number;height:number},
):void{
 const f=doc.frame;
 ctx.save();
 // Frame rotation changes the clipping aperture as well as its vector border.
 // Preserve upright image content while rotating the physical aperture.
 ctx.beginPath();ctx.save();
 ctx.translate((f.bounds.x+f.bounds.width/2)*W,
   (f.bounds.y+f.bounds.height/2)*H);
 ctx.rotate(rad(f.rotationDeg));
 framePath(ctx,-f.bounds.width*W/2,-f.bounds.height*H/2,
   f.bounds.width*W,f.bounds.height*H,
   f.radiusMm*Math.min(W/doc.output.widthMm,H/doc.output.heightMm));
 ctx.restore();ctx.clip();
 const map=(u:number,v:number)=>transformPoint(u,v,W,H,doc,adjustments);
 const renderTri=(p0:Point,p1:Point,p2:Point,q0:Point,q1:Point,q2:Point)=>{
   const xs=[q0.x,q1.x,q2.x],ys=[q0.y,q1.y,q2.y];
   if(visible && (Math.max(...xs)<visible.x-2||Math.min(...xs)>visible.x+visible.width+2||
     Math.max(...ys)<visible.y-2||Math.min(...ys)>visible.y+visible.height+2))return;
   const m=affine(p0,p1,p2,q0,q1,q2);
   // Overlap adjacent mesh triangles by 0.2 output pixel. Independent
   // antialiased canvas clips would otherwise reveal hairline alpha seams.
   // This remains below 0.1 mm even at the minimum 72-DPI output.
   const midX=(q0.x+q1.x+q2.x)/3,midY=(q0.y+q1.y+q2.y)/3;
   const expand=(p:Point):Point=>{
     const vx=p.x-midX,vy=p.y-midY,length=Math.max(1e-8,Math.hypot(vx,vy));
     return {x:p.x+vx*.2/length,y:p.y+vy*.2/length};
   };
   const t0=expand(q0),t1=expand(q1),t2=expand(q2);
   ctx.save();ctx.beginPath();
   ctx.moveTo(t0.x,t0.y);ctx.lineTo(t1.x,t1.y);ctx.lineTo(t2.x,t2.y);
   ctx.closePath();ctx.clip();
   ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);
   ctx.drawImage(image,source.sx,source.sy,source.sw,source.sh,0,0,1,1);
   ctx.restore();
 };
 // Fast path: all rotations, flips, skew, fit/fill and offsets are affine when
 // perspective is absent; draw one image regardless of tile size.
 if(!doc.imageTransform.perspective){
   const p0={x:0,y:0},p1={x:1,y:0},p2={x:0,y:1};
   const q0=map(0,0),q1=map(1,0),q2=map(0,1);
   const m=affine(p0,p1,p2,q0,q1,q2);
   ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);
   ctx.drawImage(image,source.sx,source.sy,source.sw,source.sh,0,0,1,1);
 }else{
   // Tile-aware adaptive homography: subdivide until the physical difference
   // between the projective mapping and affine triangle interpolation is
   // <=0.05 mm. A fixed 32x32 mesh could deviate by millimeters on A3 stock.
   type Cell={u:number;v:number;step:number;depth:number};
   const stack:Cell[]=[{u:0,v:0,step:1,depth:0}];
   const maxDepth=9,maxCells=80_000;
   let visited=0;
   const physicalError=(a:Point,b:Point)=>
     Math.hypot((a.x-b.x)/W*doc.output.widthMm,
       (a.y-b.y)/H*doc.output.heightMm);
   const midpoint=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
   while(stack.length){
     if(++visited>maxCells)
       throw new Error("Perspective exceeds the safe local-memory geometry budget.");
     const {u,v,step,depth}=stack.pop()!;
     const p00={x:u,y:v},p10={x:u+step,y:v};
     const p11={x:u+step,y:v+step},p01={x:u,y:v+step};
     const q00=map(p00.x,p00.y),q10=map(p10.x,p10.y);
     const q11=map(p11.x,p11.y),q01=map(p01.x,p01.y);
     if(visible){
       const xs=[q00.x,q10.x,q11.x,q01.x],ys=[q00.y,q10.y,q11.y,q01.y];
       const pad=2;
       if(Math.max(...xs)<visible.x-pad||Math.min(...xs)>visible.x+visible.width+pad||
          Math.max(...ys)<visible.y-pad||Math.min(...ys)>visible.y+visible.height+pad)
         continue;
     }
     const uMid=u+step/2,vMid=v+step/2;
     const top=map(uMid,v),right=map(u+step,vMid);
     const bottom=map(uMid,v+step),left=map(u,vMid);
     const center=map(uMid,vMid);
     const estimate=midpoint(midpoint(q00,q10),midpoint(q11,q01));
     const error=Math.max(
       physicalError(top,midpoint(q00,q10)),
       physicalError(right,midpoint(q10,q11)),
       physicalError(bottom,midpoint(q01,q11)),
       physicalError(left,midpoint(q00,q01)),
       physicalError(center,estimate),
     );
     if(error>.05){
       if(depth===maxDepth)
         throw new Error("Four-corner correction exceeds the 0.25 mm geometry precision budget.");
       const half=step/2,n=depth+1;
       stack.push({u,v,step:half,depth:n},
         {u:u+half,v,step:half,depth:n},
         {u,v:v+half,step:half,depth:n},
         {u:u+half,v:v+half,step:half,depth:n});
       continue;
     }
     renderTri(p00,p10,p11,q00,q10,q11);
     renderTri(p00,p11,p01,q00,q11,q01);
   }
 }
 ctx.restore();
}
function toArgb(hex:string,opacity:number):string{
 const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
 return "rgba("+r+","+g+","+b+","+opacity+")";
}
/** Render background behind transparency, and frame atop source, in physical
 * print coordinates. Call after photo pixel filters but before the crop mask. */
export function drawStudioFrame(
 ctx:Context,doc:CropStudioDocument,W:number,H:number,
 offsetX=0,offsetY=0,
):void{
 const f=doc.frame;
 ctx.save();
 // Frames remain independent of the image's tonal filter and opacity.
 ctx.globalAlpha=1;ctx.filter="none";ctx.globalCompositeOperation="source-over";
 ctx.translate(-offsetX,-offsetY);
 const x=f.bounds.x*W,y=f.bounds.y*H,w=f.bounds.width*W,h=f.bounds.height*H;
 ctx.translate(x+w/2,y+h/2);ctx.rotate(rad(f.rotationDeg));ctx.translate(-w/2,-h/2);
 if(f.backgroundColor&&f.backgroundOpacity>0){
   ctx.save();ctx.globalCompositeOperation="destination-over";
   ctx.fillStyle=toArgb(f.backgroundColor,f.backgroundOpacity);
   framePath(ctx,0,0,w,h,
     f.radiusMm*Math.min(W/doc.output.widthMm,H/doc.output.heightMm));
   ctx.fill();ctx.restore();
 }
 const mmToPx=Math.min(W/doc.output.widthMm,H/doc.output.heightMm);
 if(f.shadowOpacity>0){
   ctx.save();ctx.globalCompositeOperation="destination-over";
   ctx.globalAlpha=f.shadowOpacity;ctx.shadowColor=f.shadowColor;
   ctx.shadowBlur=f.shadowBlurMm*mmToPx;
   ctx.shadowOffsetX=f.shadowOffsetXMm*mmToPx;
   ctx.shadowOffsetY=f.shadowOffsetYMm*mmToPx;
   ctx.strokeStyle=f.shadowColor;ctx.lineWidth=Math.max(1,.3*mmToPx);
   framePath(ctx,0,0,w,h,f.radiusMm*mmToPx);
   ctx.stroke();ctx.restore();
 }
 if(f.borderThicknessMm>0&&f.borderOpacity>0){
   const t=f.borderThicknessMm*mmToPx;
   const radius=Math.min(w/2,h/2,f.radiusMm*mmToPx);
   ctx.save();ctx.strokeStyle=toArgb(f.borderColor,f.borderOpacity);
   ctx.lineWidth=t;
   const x0=t/2,y0=t/2,ww=Math.max(0,w-t),hh=Math.max(0,h-t);
   const r=Math.max(0,Math.min(ww/2,hh/2,radius-t/2));
   ctx.beginPath();ctx.moveTo(x0+r,y0);ctx.lineTo(x0+ww-r,y0);
   ctx.quadraticCurveTo(x0+ww,y0,x0+ww,y0+r);
   ctx.lineTo(x0+ww,y0+hh-r);ctx.quadraticCurveTo(x0+ww,y0+hh,x0+ww-r,y0+hh);
   ctx.lineTo(x0+r,y0+hh);ctx.quadraticCurveTo(x0,y0+hh,x0,y0+hh-r);
   ctx.lineTo(x0,y0+r);ctx.quadraticCurveTo(x0,y0,x0+r,y0);
   ctx.closePath();ctx.stroke();ctx.restore();
 }
 if(f.presetId){
   const primitives=createFrameGeometry(f.presetId,
     w/mmToPx,h/mmToPx,1);
   ctx.save();ctx.scale(mmToPx,mmToPx);
   ctx.globalAlpha=f.borderOpacity;
   ctx.lineJoin="round";ctx.lineCap="round";
   for(const primitive of primitives){
     ctx.beginPath();
     ctx.lineWidth=primitive.strokeWidth;
     ctx.strokeStyle=primitive.accentColor??f.borderColor;
     ctx.fillStyle=primitive.accentColor??f.borderColor;
     if(primitive.kind==="line"){
       ctx.moveTo(primitive.x1,primitive.y1);ctx.lineTo(primitive.x2,primitive.y2);
     }else if(primitive.kind==="rect"){
       ctx.rect(primitive.x,primitive.y,primitive.width,primitive.height);
     }else if(primitive.kind==="ellipse"){
       ctx.ellipse(primitive.cx,primitive.cy,primitive.rx,primitive.ry,0,0,Math.PI*2);
     }else{
       primitive.points.forEach((p,index)=>{
         if(!index)ctx.moveTo(p.x,p.y);
         else ctx.lineTo(p.x,p.y);
       });
       if(primitive.kind==="polygon")ctx.closePath();
     }
     if("fill" in primitive && primitive.fill)ctx.fill();
     ctx.stroke();
   }
   ctx.restore();
 }
 ctx.restore();
}
