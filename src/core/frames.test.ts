import assert from "node:assert/strict";
import test from "node:test";
import { createFrameGeometry, FRAME_PRESETS, isFramePresetId, MIN_FRAME_WEIGHT, MAX_FRAME_WEIGHT } from "./frames.ts";
import type { FramePrimitive } from "./frames.ts";

function bounds(primitive: FramePrimitive) {
  switch (primitive.kind) {
    case "line": return [Math.min(primitive.x1, primitive.x2), Math.min(primitive.y1, primitive.y2),
      Math.max(primitive.x1, primitive.x2), Math.max(primitive.y1, primitive.y2)];
    case "rect": return [primitive.x, primitive.y, primitive.x + primitive.width, primitive.y + primitive.height];
    case "ellipse": return [primitive.cx - primitive.rx, primitive.cy - primitive.ry,
      primitive.cx + primitive.rx, primitive.cy + primitive.ry];
    case "polyline": case "polygon": return [Math.min(...primitive.points.map(point => point.x)),
      Math.min(...primitive.points.map(point => point.y)), Math.max(...primitive.points.map(point => point.x)),
      Math.max(...primitive.points.map(point => point.y))];
  }
}

test("catalog contains 30 individually distinct designs, six per category", () => {
  assert.equal(FRAME_PRESETS.length, 30);
  assert.equal(new Set(FRAME_PRESETS.map(preset => preset.id)).size, 30);
  assert.equal(new Set(FRAME_PRESETS.map(preset => preset.name)).size, 30);
  for (const category of ["Minimal", "Classic", "Geometric", "Botanical", "Celebratory"])
    assert.equal(FRAME_PRESETS.filter(preset => preset.category === category).length, 6);
  assert.equal(new Set(FRAME_PRESETS.map(preset => JSON.stringify(createFrameGeometry(preset.id, 100, 150)))).size, 30);
  for (const preset of FRAME_PRESETS) assert.equal(isFramePresetId(preset.id), true);
  assert.equal(isFramePresetId("missing"), false);
});

test("all frames and their strokes stay inside portrait, landscape, square and narrow designs", () => {
  for (const [width, height] of [[25.4,25.4],[101.6,152.4],[152.4,101.6],[10,1000],[1000,10]]) {
    for (const preset of FRAME_PRESETS) for (const weight of [MIN_FRAME_WEIGHT, 1, MAX_FRAME_WEIGHT]) {
      const geometry=createFrameGeometry(preset.id,width,height,weight);
      assert.ok(geometry.length>0 && geometry.length<=700,preset.id);
      for (const primitive of geometry) {
        assert.ok(Number.isFinite(primitive.strokeWidth) && primitive.strokeWidth>0,preset.id);
        const [left,top,right,bottom]=bounds(primitive);
        const pad=primitive.strokeWidth/2, epsilon=Math.min(width,height)*1e-8;
        assert.ok([left,top,right,bottom].every(Number.isFinite),preset.id);
        assert.ok(left-pad>=-epsilon && top-pad>=-epsilon && right+pad<=width+epsilon && bottom+pad<=height+epsilon,
          `${preset.id}: ${primitive.kind} exceeds ${width} x ${height}`);
        if (primitive.kind === "polygon") assert.ok(primitive.points.length >= 3);
        if (primitive.kind === "polyline") assert.ok(primitive.points.length >= 2);
      }
    }
  }
});

test("invalid preset, dimensions and weight are rejected", () => {
  assert.throws(()=>createFrameGeometry("missing",100,100),/Unknown frame/);
  assert.throws(()=>createFrameGeometry("hairline",0,100),/dimensions/);
  assert.throws(()=>createFrameGeometry("hairline",NaN,100),/dimensions/);
  assert.throws(()=>createFrameGeometry("hairline",100,100,MAX_FRAME_WEIGHT+1),/weight/);
  assert.throws(()=>createFrameGeometry("hairline",100,100,MIN_FRAME_WEIGHT-.01),/weight/);
});

test("frame customization preserves legacy geometry and bounds at all supported insets and densities",()=>{
 for(const preset of FRAME_PRESETS){
  assert.deepEqual(createFrameGeometry(preset.id,25.4,50.8),createFrameGeometry(preset.id,25.4,50.8,1,{inset:0,spacing:1}));
  for(const inset of [0,.1,.2])for(const spacing of [.5,1,2]){
   for(const primitive of createFrameGeometry(preset.id,25.4,50.8,MAX_FRAME_WEIGHT,{inset,spacing})){
    const [left,top,right,bottom]=bounds(primitive),pad=primitive.strokeWidth/2;
    assert.ok(left-pad>=-1e-8&&top-pad>=-1e-8&&right+pad<=25.4+1e-8&&bottom+pad<=50.8+1e-8,preset.id);
   }
  }
 }
 assert.throws(()=>createFrameGeometry("hairline",10,10,1,{inset:.3}),/inset/);
 assert.throws(()=>createFrameGeometry("dotted",10,10,1,{spacing:NaN}),/spacing/);
});
