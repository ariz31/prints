import assert from "node:assert/strict";
import test from "node:test";
import { rasterDimensions } from "./imageRaster.ts";
test("raster footprint caps individual print images at 9 MP",()=>{
 const huge=rasterDimensions(2000,2000,300);
 assert.ok(huge.width<=3000&&huge.height<=3000);
 assert.ok(huge.width*huge.height<=9_000_000);
});
test("raster outputs exact practical two-inch physical dimensions",()=>{
 const d=rasterDimensions(50.8,50.8,300);
 assert.deepEqual(d,{width:600,height:600});
});
test("nonfinite raster inputs are rejected before allocating canvas",()=>{
 assert.throws(()=>rasterDimensions(Infinity,50,300),/Invalid raster/);
 assert.throws(()=>rasterDimensions(0,50,300),/Invalid raster/);
});
