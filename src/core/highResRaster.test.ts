import assert from "node:assert/strict";
import test from "node:test";
import {requestedRasterDimensions,MAX_EXPORT_PIXELS,tileScratchBounds,isHighResHealSafe} from "./highResRaster.ts";
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

test("high-resolution heal sample halo uses global coordinates and an explicit memory budget",()=>{
 const safe=tileScratchBounds(7016,9922,100,100,768,768,280);
 assert.equal(safe.left,97);
 assert.equal(safe.top,97);
 assert.ok(safe.right>=100+768+560);
 assert.ok((safe.right-safe.left)*(safe.bottom-safe.top)<=3_000_000);
 assert.equal(isHighResHealSafe(7016,9922,280),true);
 assert.equal(isHighResHealSafe(7016,9922,2000),false);
 assert.throws(()=>tileScratchBounds(7016,9922,100,100,768,768,2000),/memory/);
 assert.throws(()=>tileScratchBounds(7016,9922,7000,100,768,768,0),/Invalid/);
});
