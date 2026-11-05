import test from "node:test";
import assert from "node:assert/strict";
import {clockwiseTilePlacement} from "./pdfTileGeometry.ts";
const frame={x:11,y:23,width:140,height:200};
const raster={width:6000,height:4000};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test("clockwise full-image PDF rotation matches preview at any DPI",()=>{
 const p=clockwiseTilePlacement(frame,{x:0,y:0,...raster},raster);
 assert.deepEqual(p,{x:11,y:223,width:200,height:140});
});

test("clockwise tiled PDF quadrants align in physical coordinates",()=>{
 const placements=[
  clockwiseTilePlacement(frame,{x:0,y:0,width:3000,height:2000},raster),
  clockwiseTilePlacement(frame,{x:3000,y:0,width:3000,height:2000},raster),
  clockwiseTilePlacement(frame,{x:0,y:2000,width:3000,height:2000},raster),
  clockwiseTilePlacement(frame,{x:3000,y:2000,width:3000,height:2000},raster),
 ];
 // Each PDF image has a -90° transform: its on-page physical bounds are
 // [anchor.x,anchor.x+height] by [anchor.y-width,anchor.y].
 const bounds=placements.map(p=>({
  x0:p.x,x1:p.x+p.height,y0:p.y-p.width,y1:p.y,
 }));
 // Source top-left quadrant becomes output top-right when rotated clockwise.
 near(bounds[0].x0,81);near(bounds[0].x1,151);
 near(bounds[0].y0,123);near(bounds[0].y1,223);
 // Source top-right becomes bottom-right.
 near(bounds[1].x0,81);near(bounds[1].y0,23);
 // Source bottom-left becomes top-left.
 near(bounds[2].x0,11);near(bounds[2].y0,123);
 // Source bottom-right becomes bottom-left.
 near(bounds[3].x0,11);near(bounds[3].y0,23);
 const area=bounds.reduce((sum,b)=>sum+(b.x1-b.x0)*(b.y1-b.y0),0);
 near(area,frame.width*frame.height);
});

test("rejects tile overruns and invalid dimensions",()=>{
 assert.throws(()=>clockwiseTilePlacement(frame,{x:5900,y:0,width:200,height:1},raster),/Invalid/);
 assert.throws(()=>clockwiseTilePlacement(frame,{x:0,y:0,width:0,height:1},raster),/Invalid/);
});
