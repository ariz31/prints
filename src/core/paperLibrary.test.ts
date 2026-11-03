import assert from "node:assert/strict";
import test from "node:test";
import {MAX_CUSTOM_PAPERS,parsePaperLibrary,validCustomPaperSize,validatePaperLibrary,
 readPaperLibrary,savePaperLibrary,PAPER_LIBRARY_KEY,samePaperSize} from "./paperLibrary.ts";
const p={id:"size-one",name:"Half bond",widthMm:215.9,heightMm:165.1};
test("custom paper definitions validate finite physical measurements and names",()=>{
 assert.ok(validCustomPaperSize(p));
 for(const bad of [
   {...p,name:""},{...p,name:"  margin "},{...p,widthMm:0},
   {...p,heightMm:2001},{...p,widthMm:Number.NaN},{...p,name:"bad\nname"},
   {...p,id:"a b"},
 ]) assert.equal(validCustomPaperSize(bad),false);
 assert.equal(samePaperSize(p,{widthMm:215.90001,heightMm:165.1}),true);
 assert.equal(samePaperSize(p,{widthMm:220,heightMm:165.1}),false);
});
test("the library rejects duplicates, oversized lists and malformed stored data",()=>{
 assert.deepEqual(parsePaperLibrary([p,{...p,id:"two"}, {...p,id:"three",name:"HALF BOND"}]),[p]);
 assert.throws(()=>validatePaperLibrary([p,{...p,id:"two"}]),/unique/);
 assert.throws(()=>validatePaperLibrary(Array.from({length:MAX_CUSTOM_PAPERS+1},(_,i)=>
   ({...p,id:"x-"+i,name:"Size "+i}))),/unique/);
 assert.deepEqual(parsePaperLibrary({}),[]);
});
test("custom paper sizes persist locally and can be edited/deleted",()=>{
 const data=new Map<string,string>();
 const original=globalThis.localStorage;
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{
   getItem:(key:string)=>data.get(key)??null,
   setItem:(key:string,value:string)=>{data.set(key,value);},
 }});
 try{
   savePaperLibrary([p]);
   assert.deepEqual(readPaperLibrary(),[p]);
   savePaperLibrary([{...p,widthMm:210}]);
   assert.equal(readPaperLibrary()[0].widthMm,210);
   savePaperLibrary([]);
   assert.deepEqual(readPaperLibrary(),[]);
   data.set(PAPER_LIBRARY_KEY,"bad json");
   assert.deepEqual(readPaperLibrary(),[]);
 }finally{
   if(original===undefined)delete (globalThis as {localStorage?:Storage}).localStorage;
   else Object.defineProperty(globalThis,"localStorage",{configurable:true,value:original});
 }
});
