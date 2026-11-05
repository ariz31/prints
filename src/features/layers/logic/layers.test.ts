import assert from "node:assert/strict";
import test from "node:test";
import { layerRectMm, parseHexColor, validDesignLayers, MAX_DESIGN_LAYERS } from "./layers.ts";
import type { DesignLayer } from "./layers.ts";

const layer: DesignLayer = {
  kind: "text", id: "title", name: "Title", visible: true, x: .1, y: .2,
  width: .6, height: .2, color: "#123456", text: "Hello", fontSizePt: 10,
};

test("converts layer geometry into exact placement coordinates", () => {
  assert.deepEqual(layerRectMm(layer, { xMm: 5, yMm: 10, widthMm: 100, heightMm: 50 }),
    { xMm: 15, yMm: 20, widthMm: 60, heightMm: 10 });
});
test("validates layer lists and rejects accidental overflow", () => {
  assert.equal(validDesignLayers([layer]), true);
  assert.equal(validDesignLayers([{ ...layer, x: .9 }]), false);
  assert.equal(validDesignLayers([{ ...layer, fontSizePt: NaN }]), false);
  assert.equal(validDesignLayers([layer, layer]), false);
  assert.equal(validDesignLayers([{ ...layer, text: "x".repeat(301) }]), false);
});
test("colors must be exact, safe CSS hex notation", () => {
  assert.deepEqual(parseHexColor("#ff8000"), [1, 128/255, 0]);
  assert.throws(() => parseHexColor("red"), /six-digit/);
});

test("design layer limit permits the boundary but rejects accidental extra layers",()=>{
 const exactlyAtLimit=Array.from({length:MAX_DESIGN_LAYERS},(_,index)=>({
   ...layer,id:"layer-"+index,
 }));
 assert.equal(validDesignLayers(exactlyAtLimit),true);
 assert.equal(validDesignLayers([...exactlyAtLimit,{...layer,id:"extra"}]),false);
});
