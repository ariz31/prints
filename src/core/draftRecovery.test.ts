import assert from "node:assert/strict";
import test from "node:test";
import {validRecoveryRecord,obsoleteRecoveryIds} from "./draftRecovery.ts";
const stub={schemaVersion:1,assets:[],name:"Draft"};
test("recovery records must have a positive revision and project envelope",()=>{
 const obj={id:"session-1",revision:1730000000000,updatedAt:new Date().toISOString(),project:stub};
 assert.equal(validRecoveryRecord(obj),true);
 assert.equal(validRecoveryRecord({...obj,revision:0}),false);
 assert.equal(validRecoveryRecord({...obj,id:""}),false);
 assert.equal(validRecoveryRecord({...obj,project:{schemaVersion:2,assets:[]}}),false);
 assert.equal(validRecoveryRecord({...obj,updatedAt:"bad"}),false);
});

test("old invisible drafts are pruned without evicting the six newest",()=>{
 const records=Array.from({length:9},(_,index)=>({
  id:"tab-"+index,revision:1000+index,updatedAt:new Date(100000+index).toISOString(),
  project:stub,
 }));
 const pruned=obsoleteRecoveryIds(records);
 assert.deepEqual(pruned,["tab-0","tab-1","tab-2"]);
 assert.deepEqual(obsoleteRecoveryIds([...records].reverse()).sort(),pruned);
});
test("retention handles simultaneous timestamp ties and invalid stale records",()=>{
 const records=Array.from({length:8},(_,index)=>({
  id:"session-"+index,revision:2000,updatedAt:"2026-10-23T14:00:00.000Z",
  project:stub,
 }));
 const out=obsoleteRecoveryIds(records);
 assert.deepEqual(out,["session-6","session-7"]);
 const invalid={...records[0],id:"corrupt-draft",project:{schemaVersion:999,assets:[]}};
 assert.ok(obsoleteRecoveryIds([...records,invalid] as typeof records).includes("corrupt-draft"));
 assert.throws(()=>obsoleteRecoveryIds(records,0),/Invalid/);
});
