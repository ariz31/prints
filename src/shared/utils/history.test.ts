import assert from "node:assert/strict";
import test from "node:test";
import {emptyHistory,pushHistory,travelHistory} from "./history.ts";
test("undo and redo reconstruct editor state without mutation",()=>{
 let h=emptyHistory<number>();
 h=pushHistory(h,1);h=pushHistory(h,2);
 const prev=travelHistory(h,3,"undo")!;
 assert.equal(prev.value,2);
 const next=travelHistory(prev.history,prev.value,"redo")!;
 assert.equal(next.value,3);
 assert.deepEqual(next.history.redo,[]);
});
test("new edit invalidates redo; memory remains bounded",()=>{
 let h=emptyHistory<number>();
 for(let i=0;i<90;i++)h=pushHistory(h,i,30);
 assert.equal(h.undo.length,30);
 const back=travelHistory(h,90,"undo")!;
 const next=pushHistory(back.history,back.value,30);
 assert.deepEqual(next.redo,[]);
 assert.throws(()=>pushHistory(h,90,0),/limit/);
});
