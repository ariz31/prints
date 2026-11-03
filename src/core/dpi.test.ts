import assert from "node:assert/strict";
import test from "node:test";
import {DPI_PRESETS,isPresetDpi,validExportDpi,MIN_EXPORT_DPI,MAX_EXPORT_DPI} from "./dpi.ts";
import {requestedRasterDimensions} from "./highResRaster.ts";
test("DPI presets are unique, ordered and accepted by validators",()=>{
 const values=DPI_PRESETS.map(p=>p.value);
 assert.deepEqual(values,[72,96,150,200,300,450,600,1200]);
 assert.equal(new Set(values).size,values.length);
 for(const dpi of values)assert.ok(validExportDpi(dpi));
 for(const dpi of [72,96,300,375,600,725,1200])assert.ok(validExportDpi(dpi));
 for(const invalid of [-1,0,71,1201,Infinity,NaN,72.5,"300",null,undefined])
   assert.equal(validExportDpi(invalid),false);
 assert.equal(MIN_EXPORT_DPI,72);assert.equal(MAX_EXPORT_DPI,1200);
 assert.equal(isPresetDpi(375),false);
 assert.equal(isPresetDpi(450),true);
});
test("custom DPI produces precise unscaled output on safe-sized images",()=>{
 assert.deepEqual(requestedRasterDimensions(25.4,25.4,375),{width:375,height:375});
 assert.deepEqual(requestedRasterDimensions(25.4,25.4,1200),{width:1200,height:1200});
 assert.throws(()=>requestedRasterDimensions(297,420,1200),/budget/);
 assert.throws(()=>requestedRasterDimensions(25.4,25.4,1201),/Invalid/);
});
