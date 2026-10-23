import assert from "node:assert/strict";
import test from "node:test";
import {validRecoveryRecord,obsoleteRecoveryIds,newestRecoveryFirst} from "./draftRecovery.ts";
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

test("newly saved low-revision draft must outrank older high-revision sessions",()=>{
 const records=Array.from({length:7},(_,i)=>({
  id:"old-"+i,revision:10000+i,updatedAt:new Date(Date.UTC(2026,9,22,i)).toISOString(),
  project:stub,
 }));
 const fresh={id:"new",revision:1,updatedAt:"2026-10-24T02:00:00.000Z",project:stub};
 const ordered=[...records,fresh].sort(newestRecoveryFirst);
 assert.equal(ordered[0].id,"new");
 const removed=obsoleteRecoveryIds([...records,fresh]);
 assert.ok(!removed.includes("new"),"latest recovered work must never be removed");
 assert.deepEqual(removed.sort(),["old-0","old-1"]);
});
test("timestamp controls sorting for different timezone offsets and same-time revisions",()=>{
 const a={id:"early",revision:100000,updatedAt:"2026-10-24T00:30:00+08:00",project:stub};
 const b={id:"later",revision:1,updatedAt:"2026-10-23T18:00:00Z",project:stub};
 assert.equal([a,b].sort(newestRecoveryFirst)[0].id,"later");
 const same={...b,id:"later-2",revision:2};
 assert.equal([same,b].sort(newestRecoveryFirst)[0].id,"later-2");
});
