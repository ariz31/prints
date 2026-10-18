import assert from "node:assert/strict";
import test from "node:test";
import { validProjectSettings } from "./projectStore.ts";

const valid = {
  paper: "A4", orientation: "portrait", customWidthMm: 210, customHeightMm: 297,
  marginMm: 5, gapMm: 3, cutGuides: true,
};
test("accepts a complete project geometry configuration", () => {
  assert.equal(validProjectSettings(valid), true);
});
test("rejects corrupted project geometry", () => {
  assert.equal(validProjectSettings({ ...valid, marginMm: -1 }), false);
  assert.equal(validProjectSettings({ ...valid, paper: "Unknown" }), false);
  assert.equal(validProjectSettings({ ...valid, customWidthMm: Infinity }), false);
  assert.equal(validProjectSettings({ ...valid, cutGuides: "yes" }), false);
});
