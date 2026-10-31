import assert from "node:assert/strict";
import test from "node:test";
import { validProjectSettings,validateStoredProject } from "./projectStore.ts";

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

test("recovery rejects invalid project metadata using the same checks as saved projects",()=>{
 const snapshot={schemaVersion:1 as const,id:"test",name:"Prints",updatedAt:new Date().toISOString(),
   settings:{...valid,paper:"A4" as const,orientation:"portrait" as const},
   assets:[]};
 assert.equal(validateStoredProject(snapshot),snapshot);
 assert.throws(()=>validateStoredProject({...snapshot,settings:{...snapshot.settings,marginMm:-1}}));
 assert.throws(()=>validateStoredProject({...snapshot,assets:[{id:"x",original:"not a Blob"}] as never}));
});
