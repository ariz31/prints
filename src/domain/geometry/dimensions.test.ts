import assert from "node:assert/strict";
import test from "node:test";
import { lookupPrintSize,matchingPrintSizePreset, PRINT_SIZE_PRESETS } from "./dimensions.ts";

test("official dimensions of 1x1, 2x2 and CR80/ID-1 geometry", () => {
  assert.deepEqual(lookupPrintSize("photo-1x1"), { widthMm: 25.4, heightMm: 25.4 });
  assert.deepEqual(lookupPrintSize("photo-2x2"), { widthMm: 50.8, heightMm: 50.8 });
  assert.deepEqual(lookupPrintSize("id-1"), { widthMm: 85.6, heightMm: 53.98 });
});
test("presets are unique, valid and unknown IDs do not silently default", () => {
  assert.equal(new Set(PRINT_SIZE_PRESETS.map(x=>x.id)).size, PRINT_SIZE_PRESETS.length);
  assert.ok(PRINT_SIZE_PRESETS.every(x=>x.widthMm>0 && x.heightMm>0));
  assert.throws(()=>lookupPrintSize("invalid"),/Unknown/);
});

test("active print preset follows dimensions through edits, restoration and reload",()=>{
  for(const preset of PRINT_SIZE_PRESETS){
    assert.equal(matchingPrintSizePreset(preset.widthMm,preset.heightMm),preset.id);
    assert.equal(matchingPrintSizePreset(preset.widthMm+0.0005,preset.heightMm),preset.id);
  }
  assert.equal(matchingPrintSizePreset(50.8,51),null);
  assert.equal(matchingPrintSizePreset(50.8,55),null);
  assert.equal(matchingPrintSizePreset(0,50.8),null);
  assert.equal(matchingPrintSizePreset(Number.NaN,50.8),null);
  const restored=lookupPrintSize("photo-2x2");
  assert.equal(matchingPrintSizePreset(restored.widthMm,restored.heightMm),"photo-2x2");
});
