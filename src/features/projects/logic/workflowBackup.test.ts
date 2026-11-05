import assert from "node:assert/strict";
import test from "node:test";
import {createWorkflowBackup,readWorkflowBackup} from "./workflowBackup.ts";
import type {SavedWorkflow} from "./workflow.ts";
const recipe:SavedWorkflow={schemaVersion:1,id:"w",name:"A4 Photos",
 description:"",updatedAt:"2026",steps:[{id:"s",enabled:true,
 operation:"copies.set",reviewMode:"never",parameters:{quantity:12}}]};
test("workflow backups roundtrip safely with fresh IDs",async()=>{
 const blob=createWorkflowBackup([recipe]);
 const restored=await readWorkflowBackup(blob);
 assert.equal(restored.length,1);
 assert.equal(restored[0].name,recipe.name);
 assert.notEqual(restored[0].id,recipe.id);
 assert.notEqual(restored[0].steps[0].id,recipe.steps[0].id);
 assert.deepEqual(restored[0].steps[0].parameters,recipe.steps[0].parameters);
});
test("backup reader rejects invalid and unsupported operation data",async()=>{
 await assert.rejects(readWorkflowBackup(new Blob(["not-json"])),/Invalid/);
 const file=JSON.parse(await createWorkflowBackup([recipe]).text());
 file.workflows[0].steps[0].operation="arbitrary.execute";
 await assert.rejects(readWorkflowBackup(new Blob([JSON.stringify(file)])),/Invalid or unsupported/);
});
test("backup output is bounded",()=>{
 assert.throws(()=>createWorkflowBackup(Array.from({length:101},()=>recipe)),/exceeds 100/);
});
