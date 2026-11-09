import assert from "node:assert/strict";
import test from "node:test";
import {encodeMask,decodeMask,defaultBackgroundRecipe,renderMask,
 confidenceToAlpha,applyStroke,validBackgroundRecipe} from "./backgroundRecipe.ts";
test("compresses and restores run-length masks without losing pixels",()=>{
 const raw=new Uint8Array(40*30);
 raw.fill(255,100,900);
 const packed=encodeMask(raw,40,30);
 assert.ok(packed.encoded.length<raw.length/3);
 assert.deepEqual(decodeMask(packed),raw);
});
test("raw high-entropy mask round-trips and rejects malformed encoded runs",()=>{
 const raw=Uint8Array.from({length:256},(_,i)=>i);
 const packed=encodeMask(raw,16,16);
 assert.deepEqual(decodeMask(packed),raw);
 assert.throws(()=>decodeMask({width:16,height:16,encoded:"AA=="}),/raw mask/i);
});
test("manual corrections survive AI threshold reapplication",()=>{
 const recipe=defaultBackgroundRecipe(new Uint8Array([255,255,255,255]),2,2);
 recipe.confidence=encodeMask(new Uint8Array([80,180,80,180]),2,2);
 recipe.strokes=[{points:[{x:0,y:0}],mode:"restore",radius:.01,hardness:1,opacity:1,snap:false}];
 const first=renderMask(recipe,2,2);
 assert.equal(first[0],255);
 recipe.threshold=.8;
 const second=renderMask(recipe,2,2);
 assert.equal(second[0],255,"restore brush is retained");
 assert.notDeepEqual(first,second,"AI threshold still affects unpainted regions");
});
test("supports transparent and partial-opacity brushes",()=>{
 const alpha=new Uint8Array(25).fill(255);
 applyStroke(alpha,5,5,{mode:"erase",points:[{x:.5,y:.5}],radius:.2,hardness:1,opacity:.5,snap:true});
 assert.ok(alpha[12]<255&&alpha[12]>0);
 assert.equal(alpha[0],255);
});
test("source and saved recipe remain valid independent of flattened PNG",()=>{
 const base=defaultBackgroundRecipe(new Uint8Array([0,128,255,255]),2,2);
 base.backdrop={kind:"color",color:"#ffffff"};
 assert.ok(validBackgroundRecipe(base));
 const saved=JSON.parse(JSON.stringify(base));
 assert.ok(validBackgroundRecipe(saved));
 assert.deepEqual(renderMask(saved,2,2),new Uint8Array([0,128,255,255]));
 assert.equal(validBackgroundRecipe({...base,alpha:{width:0,height:2,encoded:"AA=="}}),false);
 assert.equal(validBackgroundRecipe({...base,backdrop:{kind:"image",dataUrl:"https://remote.example/unsafe"}}),false);
});
test("confidence matte clamps to valid interval",()=>{
 assert.deepEqual(confidenceToAlpha(new Uint8Array([0,128,255]),.5,.1),new Uint8Array([0,133,255]));
});
