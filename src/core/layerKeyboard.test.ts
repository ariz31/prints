import assert from "node:assert/strict";
import test from "node:test";
import {nudgeLayer} from "./layerKeyboard.ts";
import type {DesignLayer} from "./layers.ts";
const layer:DesignLayer={kind:"rectangle",id:"one",name:"Shape",visible:true,
 x:.2,y:.3,width:.3,height:.2,color:"#123456"};
test("keyboard arrows move layers at one percent increments",()=>{
 const left=nudgeLayer(layer,"ArrowLeft");
 assert.ok(Math.abs(left!.x-.19)<1e-9);
 assert.equal(left!.width,.3);
 assert.deepEqual(nudgeLayer(layer,"Escape"),null);
});
test("Shift resizes; Alt provides a fine editing step",()=>{
 const wider=nudgeLayer(layer,"ArrowRight",true)!;
 assert.ok(Math.abs(wider.width-.31)<1e-9);
 const smaller=nudgeLayer(layer,"ArrowLeft",true,true)!;
 assert.ok(Math.abs(smaller.width-.299)<1e-9);
 const nudge=nudgeLayer(layer,"ArrowDown",false,true)!;
 assert.ok(Math.abs(nudge.y-.301)<1e-9);
});
test("keyboard movement and resizing cannot leave print bounds",()=>{
 const max={...layer,x:.7,y:.8};
 assert.equal(nudgeLayer(max,"ArrowRight")?.x,.7);
 assert.equal(nudgeLayer(max,"ArrowDown",true)?.height,.2);
});
