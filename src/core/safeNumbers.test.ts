import assert from "node:assert/strict";
import test from "node:test";
import {parseBoundedNumber,workflowParameterBounds} from "./safeNumbers.ts";
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

test("workflow preserves legitimate zero and rejects zero physical sizes",()=>{
 const values=[
  ["marginMm",0,true],["gapMm",0,true],["focalX",0,true],
  ["brightness",0,true],["saturation",0,true],
  ["quantity",0,false],["widthMm",0,false],["heightMm",0,false],
  ["customWidthMm",0,false],["customHeightMm",0,false],
 ];
 for(const [key,value,allowed] of values){
   const {min,max,integer}=workflowParameterBounds(String(key));
   assert.equal(parseBoundedNumber(String(value),min,max,integer)!==null,allowed,key as string);
 }
});
