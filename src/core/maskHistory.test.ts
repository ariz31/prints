import {test} from "node:test";
import assert from "node:assert/strict";
import {MaskHistory} from "./maskHistory.ts";
test("mask undo is isolated from mutable brush pixels, byte bounded and branches safely",()=>{
 const history=new MaskHistory(12),pixels=new Uint8ClampedArray([1,2,3,4]);
 history.commit(pixels);pixels[3]=0;history.commit(pixels);
 assert.equal(history.travel("undo")![3],4);
 const copy=history.travel("redo")!;copy[3]=9;
 assert.equal(history.travel("undo")![3],4);
 history.commit(new Uint8ClampedArray([1,1,1,1]));assert.equal(history.canRedo,false);
 for(let i=0;i<20;i++)history.commit(new Uint8ClampedArray([i,2,3,4]));
 assert.equal(history.byteLength,12);history.clear();assert.equal(history.canUndo,false);assert.equal(history.byteLength,0);
});
