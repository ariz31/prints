import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ADJUSTMENTS,photoFilterCss,validPhotoAdjustments } from "./photoAdjustments.ts";
test("adjustments are stable and generate CSS canvas-compatible filters",()=>{
 assert.equal(photoFilterCss(),"none");
 assert.equal(photoFilterCss(DEFAULT_ADJUSTMENTS),"brightness(1) contrast(1) saturate(1)");
 assert.equal(photoFilterCss({brightness:20,contrast:-10,saturation:50}),
  "brightness(1.2) contrast(0.9) saturate(1.5)");
});
test("invalid adjustments never reach image pixels or project imports",()=>{
 assert.equal(validPhotoAdjustments({brightness:NaN,contrast:0,saturation:0}),false);
 assert.equal(validPhotoAdjustments({brightness:0,contrast:0,saturation:999}),false);
 assert.throws(()=>photoFilterCss({brightness:101,contrast:0,saturation:0}),/Invalid/);
});
