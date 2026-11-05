import assert from "node:assert/strict";
import test from "node:test";
import {validDesignLayers,newLayer} from "./layers.ts";
test("opacity accepts zero, transparency and full opacity for all printable layer kinds",()=>{
 for(const kind of ["text","rectangle","ellipse"] as const){
  const base=newLayer(kind);
  for(const opacity of [undefined,0,.001,.5,1]){
   assert.equal(validDesignLayers([{...base,opacity}]),true,kind+" opacity "+opacity);
  }
 }
});
test("opacity rejects nonfinite and out-of-bounds values without converting zero",()=>{
 const layer=newLayer("text");
 for(const opacity of [-.001,1.001,Number.NaN,Infinity,-Infinity,"0.5",null]){
  assert.equal(validDesignLayers([{...layer,opacity}]),false,String(opacity));
 }
});
