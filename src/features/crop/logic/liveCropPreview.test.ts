import assert from "node:assert/strict";
import test from "node:test";
import {liveCropImageStyle} from "./liveCropPreview.ts";
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
