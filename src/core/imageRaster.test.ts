import assert from "node:assert/strict";
import test from "node:test";
import { rasterDimensions,previewRasterDimensions } from "./imageRaster.ts";
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

test("crop previews stay within mobile pixel budget",()=>{
 for(const [w,h] of [[297,420],[420,297],[1500,2000],[50.8,50.8]]){
  const value=previewRasterDimensions(w,h);
  assert.ok(value.width>0&&value.height>0);
  assert.ok(value.width<=1400&&value.height<=1400&&value.width*value.height<=1_600_000);
 }
});
