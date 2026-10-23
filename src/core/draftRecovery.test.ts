import assert from "node:assert/strict";
import test from "node:test";
import {validRecoveryRecord} from "./draftRecovery.ts";
const stub={schemaVersion:1,assets:[],name:"Draft"};
test("recovery records must have a positive revision and project envelope",()=>{
 const obj={id:"session-1",revision:1730000000000,updatedAt:new Date().toISOString(),project:stub};
 assert.equal(validRecoveryRecord(obj),true);
 assert.equal(validRecoveryRecord({...obj,revision:0}),false);
 assert.equal(validRecoveryRecord({...obj,id:""}),false);
 assert.equal(validRecoveryRecord({...obj,project:{schemaVersion:2,assets:[]}}),false);
 assert.equal(validRecoveryRecord({...obj,updatedAt:"bad"}),false);
});
