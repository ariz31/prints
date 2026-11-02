import assert from "node:assert/strict";
import test from "node:test";
import {relativePreviewFilter,shouldPublishPreviewResult} from "./photoPreviewFeedback.ts";
import {DEFAULT_ADJUSTMENTS} from "./photoAdjustments.ts";

test("cached advanced raster receives immediate tonal changes",()=>{
 const current={...DEFAULT_ADJUSTMENTS,brightness:20,contrast:10,saturation:30,sharpness:40};
 const rendered={...DEFAULT_ADJUSTMENTS,brightness:10,contrast:0,saturation:0,sharpness:40};
 const css=relativePreviewFilter(current,rendered);
 assert.ok(css);
 assert.match(css,/brightness\(1\.090909/);
 assert.match(css,/contrast\(1\.1\)/);
 assert.match(css,/saturate\(1\.3\)/);
 assert.equal(relativePreviewFilter(current,current),"none");
});
test("source fallback is necessary if cached preview is completely black",()=>{
 const rendered={...DEFAULT_ADJUSTMENTS,brightness:-100};
 assert.equal(relativePreviewFilter({...rendered,brightness:20},rendered),null);
});

test("final decoded image cannot regress to delayed interactive quality",()=>{
 const final={key:"photo-source:cropA:adjustA",quality:"final"} as const;
 const interactive={key:final.key,quality:"interactive"} as const;
 assert.equal(shouldPublishPreviewResult(final,interactive),false);
 assert.equal(shouldPublishPreviewResult(interactive,final),true);
 assert.equal(shouldPublishPreviewResult(null,interactive),true);
 assert.equal(shouldPublishPreviewResult(final,{...interactive,key:"photo-source:cropA:adjustB"}),true);
 assert.equal(shouldPublishPreviewResult(final,final),true);
});
