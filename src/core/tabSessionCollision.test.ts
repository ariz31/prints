import assert from "node:assert/strict";
import test from "node:test";
import {shouldForkSession,validSessionPeerMessage} from "./tabSessionCollision.ts";

test("a late duplicate yields to a tab with an established lease",()=>{
  assert.equal(shouldForkSession("new",{kind:"present",token:"shared",instance:"old"},false),true);
  assert.equal(shouldForkSession("old",{kind:"probe",token:"shared",instance:"new"},true),false);
});
test("simultaneous duplicate tabs deterministically elect one original",()=>{
  assert.equal(shouldForkSession("b",{kind:"probe",token:"shared",instance:"a"},false),true);
  assert.equal(shouldForkSession("a",{kind:"probe",token:"shared",instance:"b"},false),false);
  assert.equal(shouldForkSession("a",{kind:"probe",token:"shared",instance:"a"},false),false);
});
test("ignore invalid untrusted broadcast messages",()=>{
  for(const data of [null,{},0,{kind:"probe",token:"",instance:"peer"},
    {kind:"unknown",token:"shared",instance:"peer"},
    {kind:"present",token:"shared",instance:123}]){
    assert.equal(validSessionPeerMessage(data),false);
  }
  assert.equal(validSessionPeerMessage({kind:"present",token:"shared",instance:"other"}),true);
});
