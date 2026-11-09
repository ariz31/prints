import assert from "node:assert/strict";
import test from "node:test";
import { validProjectSettings,validateStoredProject } from "./projectStore.ts";
import {defaultBackgroundRecipe} from "../../background-removal/logic/backgroundRecipe.ts";

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

test("local project recovery preserves valid editable background masks and rejects corruption",()=>{
 const recipe=defaultBackgroundRecipe(new Uint8Array([0,128,255,255]),2,2);
 const base={schemaVersion:1 as const,id:"background-v2",name:"ID Prints",
   updatedAt:"2026-11-09T00:00:00Z",
   settings:{...valid,paper:"A4" as const,orientation:"portrait" as const},
   assets:[{id:"photo-1",original:new Blob([new Uint8Array([1])],{type:"image/png"}),
     widthMm:50,heightMm:50,quantity:1,pixelWidth:2,pixelHeight:2,
     backgroundEdit:recipe}]};
 assert.equal(validateStoredProject(base),base);
 assert.deepEqual(validateStoredProject(base).assets[0].backgroundEdit,recipe);
 const corrupted={...base,assets:[{...base.assets[0],
   backgroundEdit:{...recipe,alpha:{width:2,height:2,encoded:"AA=="}}}]};
 assert.throws(()=>validateStoredProject(corrupted),/invalid|newer/i);
 const malformed={...base,assets:[{...base.assets[0],
   backgroundEdit:{...recipe,backdrop:{kind:"image" as const,dataUrl:"https://untrusted.example/backdrop.png"}}}]};
 assert.throws(()=>validateStoredProject(malformed),/invalid|newer/i);
});
