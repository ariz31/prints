import {test} from "node:test";
import assert from "node:assert/strict";
import {planRecoveredWorkspace} from "./workspaceRecovery.ts";

test("unsaved recovery never binds a named project",()=>{
  assert.deepEqual(planRecoveredWorkspace(undefined,{id:"saved",revision:"a"}),
    {projectId:null,revision:null,conflict:false});
});
test("matching saved revision resumes the original named project",()=>{
  assert.deepEqual(planRecoveredWorkspace({projectId:"saved",revision:"a"},
    {id:"saved",revision:"a"}),
    {projectId:"saved",revision:"a",conflict:false});
});
test("another tab's edit or deletion never gets overwritten on restoration",()=>{
  for(const current of [{id:"saved",revision:"b"},{id:"other",revision:"a"},null]){
    assert.deepEqual(planRecoveredWorkspace({projectId:"saved",revision:"a"},current),
      {projectId:null,revision:null,conflict:true});
  }
});
