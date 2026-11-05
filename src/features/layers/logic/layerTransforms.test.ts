import assert from "node:assert/strict";
import test from "node:test";
import { transformLayer } from "./layerTransforms.ts";
const layer={x:.2,y:.25,width:.3,height:.25};
test("moving a layer respects edges",()=>{
 assert.deepEqual(transformLayer(layer,"move",.2,-.1),
   {x:.4,y:.15,width:.3,height:.25});
 assert.deepEqual(transformLayer(layer,"move",4,-3),
   {x:.7,y:0,width:.3,height:.25});
});
test("resizing a layer stays inside the print design",()=>{
 const grow=transformLayer(layer,"resize",10,10);
 assert.ok(Math.abs(grow.x+grow.width-1)<1e-9);
 assert.ok(Math.abs(grow.y+grow.height-1)<1e-9);
 const shrink=transformLayer(layer,"resize",-10,-10);
 assert.ok(shrink.width>=.02&&shrink.height>=.02);
});
test("invalid drag geometry fails rather than corrupting project",()=>{
 assert.throws(()=>transformLayer(layer,"move",NaN,0),/Invalid/);
});
