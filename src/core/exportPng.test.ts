import assert from "node:assert/strict";
import test from "node:test";
import { outputPngName } from "./exportPng.ts";
import { rasterDimensions } from "./imageRaster.ts";
test("PNG export honors 2x2 inch sizing and common photo resolutions",()=>{
 assert.deepEqual(rasterDimensions(50.8,50.8,300),{width:600,height:600});
 assert.deepEqual(rasterDimensions(25.4,25.4,600),{width:600,height:600});
});
test("download names never incorporate unsafe path characters",()=>{
 assert.equal(outputPngName("family photo?.jpg"),"family-photo-.png");
 assert.equal(outputPngName("../bad\\path.png"),"..-bad-path.png");
 assert.equal(outputPngName(""),"prints-design.png");
});
