import assert from "node:assert/strict";
import test from "node:test";
import {selectPages} from "./pageSelection.ts";
test("page navigation/export selection supports all and bounded ranges",()=>{
 assert.deepEqual(selectPages("all",4),[0,1,2,3]);
 assert.deepEqual(selectPages("",2),[0,1]);
 assert.deepEqual(selectPages("1-3, 5,2",6),[0,1,2,4]);
 assert.deepEqual(selectPages("4",4),[3]);
});
test("invalid and out-of-bound selections never silently export wrong sheets",()=>{
 for(const value of ["0","-1","2-1","1,","1-10","oops","3-4,8"]){
  assert.throws(()=>selectPages(value,5));
 }
 assert.deepEqual(selectPages("all",0),[]);
 assert.throws(()=>selectPages("all",201),/Invalid/);
});
