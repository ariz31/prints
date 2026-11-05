import {test} from "node:test";
import assert from "node:assert/strict";
import {alignSelection,snapSelection,transformSelection} from "./layerSelection.ts";
import {validDesignLayers} from "./layers.ts";
import type {DesignLayer} from "./layers.ts";
const layers:DesignLayer[]=[{id:"a",name:"A",kind:"rectangle",visible:true,color:"#000000",x:.1,y:.1,width:.2,height:.2},
 {id:"b",name:"B",kind:"rectangle",visible:true,color:"#000000",x:.5,y:.5,width:.3,height:.3}];
test("group move and proportional resize retain relative positions inside print bounds",()=>{
 const moved=transformSelection(layers,["a","b"],"move",1,1);
 assert.ok(Math.abs(moved[1].x-.7)<1e-12);assert.ok(Math.abs(moved[1].x-moved[0].x-.4)<1e-12);
 const resized=transformSelection(layers,["a","b"],"resize",1,1);
 assert.ok(validDesignLayers(resized));assert.ok(Math.abs(resized[1].x+resized[1].width-1)<1e-12);
 assert.ok(Math.abs(resized[0].width/resized[1].width-2/3)<1e-12);
 assert.deepEqual(layers[0].x,.1);
});
test("snapping aligns near canvas center and alignment uses selection bounds",()=>{
 const snap=snapSelection(layers,["a"],.298,0,.01,.01);
 assert.ok(Math.abs(snap.dx-.3)<1e-12);assert.ok(snap.guides.some(g=>g.axis==="x"&&g.value===.5));
 const aligned=alignSelection(layers,["a","b"],"y","end");
 assert.ok(Math.abs(aligned[0].y+aligned[0].height-.8)<1e-12);
 assert.ok(validDesignLayers(aligned));
 assert.equal(alignSelection(layers,["a"],"x","center")[0].x,.4);
});
