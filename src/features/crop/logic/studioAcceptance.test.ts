import assert from "node:assert/strict";
import test from "node:test";
import {projectSquare,hasStudioTransform} from "./studioCanvas.ts";
import {defaultBezierHandles,flattenBezierContour,validBezierHandles} from "./bezierContour.ts";
import {migrateLegacyCropStudio,studioForOutput,validCropStudioDocument} from "./studioDocument.ts";
import {requestedRasterDimensions} from "../../../platform/rendering/highResRaster.ts";

const legacy={crop:{x:.1,y:.2,width:.8,height:.6},cropShape:"rectangle" as const,
  widthMm:50.8,heightMm:50.8};
const point=(x:number,y:number)=>({x,y});
const close=(a:number,b:number,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);

test("projective mapping preserves all physical square corners in arbitrary convex quad",()=>{
 const square=[point(0,0),point(1,0),point(1,1),point(0,1)];
 for(let i=0;i<4;i++){
   const [u,v]=[[0,0],[1,0],[1,1],[0,1]][i];
   const p=projectSquare(u,v,square);
   close(p.x,square[i].x);close(p.y,square[i].y);
 }
 const quad=[point(.08,.12),point(.94,.04),point(.83,.97),point(.2,.79)];
 for(let i=0;i<4;i++){
   const [u,v]=[[0,0],[1,0],[1,1],[0,1]][i];
   const p=projectSquare(u,v,quad);
   close(p.x,quad[i].x);close(p.y,quad[i].y);
 }
 const middle=projectSquare(.5,.5,quad);
 assert.ok(middle.x>0&&middle.x<1&&middle.y>0&&middle.y<1);
});

test("v2 crop schema remains one region with identity legacy migration",()=>{
 const doc=migrateLegacyCropStudio(legacy);
 assert.equal(validCropStudioDocument(doc),true);
 assert.equal(hasStudioTransform(doc),false);
 doc.imageTransform.rotationDeg=34;
 assert.equal(hasStudioTransform(doc),true);
 doc.imageTransform.rotationDeg=0;
 doc.frame.presetId="hairline";
 assert.equal(hasStudioTransform(doc),false); // artwork uses independent frame path
 assert.equal(validCropStudioDocument(doc),true);
});

test("print modes update physical v2 sizes without mutating source geometry",()=>{
 const doc=migrateLegacyCropStudio(legacy);
 const first=studioForOutput(doc,doc.crop,50.8,50.8);
 assert.strictEqual(first,doc);
 const newCrop={x:0,y:.1,width:1,height:.5};
 const second=studioForOutput(doc,newCrop,50.8,25.4);
 assert.notStrictEqual(second,doc);
 assert.equal(second!.output.heightMm,25.4);
 assert.equal(second!.crop.width,1);
 assert.equal(second!.aspect.ratio,2);
 assert.equal(doc.output.heightMm,50.8);
 assert.equal(validCropStudioDocument(second),true);
});

test("cubic Bézier curves keep a single closed polygon and non-destructive anchors",()=>{
 const anchors=[point(.1,.1),point(.9,.1),point(.9,.9),point(.1,.9)];
 const handles=defaultBezierHandles(anchors,.15);
 assert.equal(validBezierHandles(handles,anchors),true);
 const curved=flattenBezierContour(anchors,handles,.15,50.8,50.8);
 assert.ok(curved.length>=anchors.length&&curved.length<=1024);
 close(curved[0].x,anchors[0].x);
 close(curved[0].y,anchors[0].y);
 assert.equal(anchors.length,4);
 const original=flattenBezierContour(anchors,undefined,0,50.8,50.8);
 assert.deepEqual(original,anchors);
 assert.notStrictEqual(original,anchors);
});

test("invalid Bézier handles fail closed without rasterizing undefined geometry",()=>{
 const anchors=[point(.05,.05),point(.95,.05),point(.95,.95),point(.05,.95)];
 const handles=defaultBezierHandles(anchors);
 handles[1].out.x=Number.NaN;
 assert.equal(validBezierHandles(handles,anchors),false);
 assert.throws(()=>flattenBezierContour(anchors,handles,.15,50.8,50.8),/Invalid Bézier/);
});

test("nearest export pixels honor 0.25 mm physical error or reject unrepresentable tiny jobs",()=>{
 assert.throws(()=>requestedRasterDimensions(.1,.1,72),/Increase DPI/);
 for(const mm of [1,10,25.4,50.8,210,297,420]){
  const output=requestedRasterDimensions(mm,mm,72);
  const recovered=output.width/72*25.4;
  assert.ok(Math.abs(recovered-mm)<=.25,`width ${mm}mm => ${recovered}mm`);
  assert.ok(Math.abs(output.height/72*25.4-mm)<=.25);
 }
});
