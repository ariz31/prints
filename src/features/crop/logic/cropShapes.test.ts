import assert from "node:assert/strict";
import test from "node:test";
import {CROP_SHAPES,cropShapePoints,shapeAreaFraction,
  validCropShape,shapePolygonMm} from "./cropShapes.ts";

test("exactly 15 stable crop shapes with valid simple contour bounds",()=>{
  assert.equal(CROP_SHAPES.length,15);
  assert.equal(new Set(CROP_SHAPES.map(s=>s.id)).size,15);
  for(const shape of CROP_SHAPES){
    assert.equal(validCropShape(shape.id),true);
    const polygon=cropShapePoints(shape.id);
    assert.ok(polygon.length>=3,shape.id);
    assert.ok(polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&
      p.x>=-1e-9&&p.x<=1+1e-9&&p.y>=-1e-9&&p.y<=1+1e-9),shape.id);
    assert.ok(shapeAreaFraction(shape.id)>0&&shapeAreaFraction(shape.id)<=1,shape.id);
  }
  assert.equal(validCropShape("freehand"),false);
  assert.equal(validCropShape(null),false);
});
test("classic rectangular crop stays full area; rotation transforms physical contour",()=>{
  assert.equal(shapeAreaFraction(undefined),1);
  assert.equal(shapeAreaFraction("rectangle"),1);
  const initial=shapePolygonMm("right-triangle",5,10,20,40);
  const turned=shapePolygonMm("right-triangle",5,10,40,20,true);
  assert.deepEqual(initial,[{x:5,y:10},{x:25,y:50},{x:5,y:50}]);
  assert.deepEqual(turned,[{x:45,y:10},{x:5,y:30},{x:5,y:10}]);
});

import {shapeClipPath,maskCropShape} from "./cropShapes.ts";

test("rotated shape clipping matches mm contour rotation and preserves legacy rectangle",()=>{
  assert.equal(shapeClipPath(undefined,true),undefined);
  assert.equal(shapeClipPath("rectangle",true),undefined);
  assert.equal(shapeClipPath("right-triangle",true),
    "polygon(100.000% 0.000%,0.000% 100.000%,0.000% 0.000%)");
});
test("mask uses opaque fill in destination-in mode with physical tile coordinates",()=>{
  const moves:number[][]=[];let mode="",alpha=-1,color="";
  const ctx={
    save(){},restore(){},beginPath(){},closePath(){},fill(){},
    moveTo(x:number,y:number){moves.push([x,y]);},
    lineTo(x:number,y:number){moves.push([x,y]);},
    set globalCompositeOperation(v:string){mode=v;},
    set globalAlpha(v:number){alpha=v;},
    set fillStyle(v:string){color=v;},
  };
  maskCropShape(ctx as unknown as CanvasRenderingContext2D,"triangle",200,100,10,5);
  assert.equal(mode,"destination-in");assert.equal(alpha,1);
  assert.equal(color,"#000000");
  assert.deepEqual(moves,[[90,-5],[190,95],[-10,95]]);
});

test("shape choices are accepted by existing portable project validators without changing legacy metadata",async()=>{
 const {validAssetFields}=await import("../../../core/projectArchive.ts");
 const meta:Record<string,unknown>={
   id:"shape-test",name:"Masked photo",widthMm:45,heightMm:45,
   pixelWidth:1200,pixelHeight:1200,quantity:1,focalX:50,focalY:50,
   crop:{x:0,y:0,width:1,height:1},
 };
 assert.equal(validAssetFields(meta),true,"existing rectangular projects remain readable");
 assert.equal(validAssetFields({...meta,cropShape:"heart"}),true);
 assert.equal(validAssetFields({...meta,cropShape:"invalid"}),false);
});

import {getCachedCropShapePoints,STATIC_CLIP_PATH_CACHE} from "./cropShapes.ts";

test("crop shape normalization and clip path strings are cached and memoized",()=>{
  const points1 = getCachedCropShapePoints("heart");
  const points2 = getCachedCropShapePoints("heart");
  assert.equal(points1, points2);

  const clip1 = shapeClipPath("star", false);
  const clip2 = shapeClipPath("star", false);
  assert.equal(clip1, clip2);
  assert.equal(STATIC_CLIP_PATH_CACHE.get("star:false"), clip1);

  const area1 = shapeAreaFraction("diamond");
  const area2 = shapeAreaFraction("diamond");
  assert.equal(area1, area2);
});
