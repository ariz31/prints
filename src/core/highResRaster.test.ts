import assert from "node:assert/strict";
import test from "node:test";
import {requestedRasterDimensions,MAX_EXPORT_PIXELS} from "./highResRaster.ts";
test("A3 outputs true 300 and 600 DPI pixel geometry",()=>{
 const standard=requestedRasterDimensions(297,420,300);
 const large=requestedRasterDimensions(297,420,600);
 assert.deepEqual(standard,{width:3508,height:4961});
 assert.deepEqual(large,{width:7016,height:9922});
 assert.ok(large.width*large.height<=MAX_EXPORT_PIXELS);
});
test("large and invalid rasters fail explicitly instead of silently downsampling",()=>{
 assert.throws(()=>requestedRasterDimensions(2000,2000,600),/budget/);
 assert.throws(()=>requestedRasterDimensions(297,420,Infinity),/Invalid/);
 assert.throws(()=>requestedRasterDimensions(0,420,300),/Invalid/);
});
