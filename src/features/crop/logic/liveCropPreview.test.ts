import assert from "node:assert/strict";
import test from "node:test";
import {liveCropImageStyle,canUseLiveCropPreview} from "./liveCropPreview.ts";
import {DEFAULT_ADJUSTMENTS} from "../../../core/photoAdjustments.ts";

test("live framing maps source geometry to its exact crop window without waiting for a raster",()=>{
 const a=liveCropImageStyle({x:.25,y:.1,width:.5,height:.8});
 assert.equal(a.width,"200%");
 assert.equal(a.height,"125%");
 assert.equal(a.left,"-50%");
 assert.equal(a.top,"-12.5%");
 assert.equal(a.opacity,1);
 assert.equal(a.filter,"none");
});
test("live framing retains photo tone and alpha while export remains independent",()=>{
 const s=liveCropImageStyle({x:0,y:0,width:1,height:1},
  {...DEFAULT_ADJUSTMENTS,brightness:10,opacity:35});
 assert.equal(s.opacity,.35);
 assert.match(s.filter,/brightness\(1.1\)/);
 assert.equal(s.width,"100%");
 assert.equal(s.left,"0%");
});

// CSS is exact only for the properties the browser's live <img> reproduces.
test("sharp live source stays visible for basic edits, exact raster for advanced edits",()=>{
 assert.equal(canUseLiveCropPreview(),true);
 assert.equal(canUseLiveCropPreview({...DEFAULT_ADJUSTMENTS,brightness:20,contrast:15,opacity:40}),true);
 assert.equal(canUseLiveCropPreview({...DEFAULT_ADJUSTMENTS,sharpness:20}),false);
 assert.equal(canUseLiveCropPreview({...DEFAULT_ADJUSTMENTS,rotation:90}),false);
 assert.equal(canUseLiveCropPreview({...DEFAULT_ADJUSTMENTS,backgroundColor:"#ffffff"}),false);
 assert.equal(canUseLiveCropPreview({...DEFAULT_ADJUSTMENTS,regions:[{kind:"light",x:.5,y:.5,radius:.1,strength:10}]}),false);
});

test("neutral image adjustments do not trigger a CSS filtering pass",()=>{
 const a=liveCropImageStyle({x:0,y:0,width:1,height:1},DEFAULT_ADJUSTMENTS);
 assert.equal(a.filter,"none");
 const alpha=liveCropImageStyle({x:0,y:0,width:1,height:1},{...DEFAULT_ADJUSTMENTS,opacity:45});
 assert.equal(alpha.filter,"none");
 assert.equal(alpha.opacity,.45);
 const tonal=liveCropImageStyle({x:0,y:0,width:1,height:1},{...DEFAULT_ADJUSTMENTS,contrast:8});
 assert.match(tonal.filter,/contrast\(1.08\)/);
});
