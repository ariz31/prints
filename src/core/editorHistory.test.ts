import {test} from "node:test";
import assert from "node:assert/strict";
import {editorHistory} from "./editorHistory.ts";
test("editor drafts undo slider bursts, branch after undo and discard all history on source reset",()=>{
 let h={value:{x:0},past:[] as {x:number}[],future:[] as {x:number}[]};
 h=editorHistory(h,{type:"set",value:{x:1}});
 h=editorHistory(h,{type:"set",value:{x:2},coalesce:true});
 h=editorHistory(h,{type:"undo"});assert.equal(h.value.x,0);
 h=editorHistory(h,{type:"redo"});assert.equal(h.value.x,2);
 h=editorHistory(h,{type:"undo"});h=editorHistory(h,{type:"set",value:{x:3}});
 assert.equal(h.future.length,0);
 h=editorHistory(h,{type:"reset",value:{x:9}});assert.equal(h.past.length,0);assert.equal(h.value.x,9);
});
test("history remains bounded and unchanged edits do not consume undo capacity",()=>{
 let h={value:0,past:[] as number[],future:[] as number[]};
 for(let i=1;i<=500;i++)h=editorHistory(h,{type:"set",value:i},20);
 assert.equal(h.past.length,20);assert.equal(editorHistory(h,{type:"set",value:500}),h);
 for(let i=0;i<21;i++)h=editorHistory(h,{type:"undo"},20);
 assert.equal(h.value,480);assert.equal(h.future.length,20);
});
