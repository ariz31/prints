import assert from "node:assert/strict";
import test from "node:test";
import { rasterDimensions,previewRasterDimensions,adaptiveCropPreviewDimensions } from "./imageRaster.ts";
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

// Mobile output is derived from actual screen pixels, not 120 DPI paper size.
test("adaptive preview preserves 3x mobile sharpness at two inches",()=>{
 const image=adaptiveCropPreviewDimensions(50.8,50.8,320,320,3,4032,3024);
 assert.deepEqual(image,{width:960,height:960});
 assert.ok(image.width>previewRasterDimensions(50.8,50.8).width);
});
test("adaptive previews cap device memory, GPU side and source detail",()=>{
 const huge=adaptiveCropPreviewDimensions(50.8,50.8,2000,2000,4,9000,9000);
 assert.ok(huge.width<=2048&&huge.height<=2048);
 assert.ok(huge.width*huge.height<=3_000_000);
 const small=adaptiveCropPreviewDimensions(50.8,50.8,420,420,3,500,500,.5,.5);
 assert.deepEqual(small,{width:250,height:250});
});
test("adaptive previews preserve aspect ratio, reject unsafe inputs and bound worker targets",()=>{
 const wide=adaptiveCropPreviewDimensions(50.8,25.4,360,180,3,6000,4000);
 assert.ok(Math.abs(wide.width/wide.height-2)<.01);
 const bound=previewRasterDimensions(50.8,50.8,{width:10000,height:10000});
 assert.ok(bound.width<=2048&&bound.width*bound.height<=3_000_000);
 assert.throws(()=>adaptiveCropPreviewDimensions(50.8,50.8,320,320,NaN,1000,1000),/Invalid adaptive/);
 assert.throws(()=>previewRasterDimensions(50.8,50.8,{width:-1,height:100}),/Invalid preview target/);
});
