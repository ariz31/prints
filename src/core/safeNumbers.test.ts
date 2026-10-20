import assert from "node:assert/strict";
import test from "node:test";
import {parseBoundedNumber} from "./safeNumbers.ts";
test("zero is valid where permitted and never treated as missing",()=>{
 assert.equal(parseBoundedNumber("0",0,2000),0);
 assert.equal(parseBoundedNumber("0",1,1000,true),null);
 assert.equal(parseBoundedNumber("",0,1000),null);
 assert.equal(parseBoundedNumber("  ",0,1000),null);
});
test("reject NaN, infinity, fractional copies and excessive numeric input",()=>{
 for(const value of ["NaN","Infinity","-Infinity","1e999","foo","-1"]){
   assert.equal(parseBoundedNumber(value,0,1000),null);
 }
 assert.equal(parseBoundedNumber("1.5",1,1000,true),null);
 assert.equal(parseBoundedNumber("1001",1,1000,true),null);
 assert.equal(parseBoundedNumber("1",1,1000,true),1);
 assert.equal(parseBoundedNumber("12",1,1000,true),12);
});
