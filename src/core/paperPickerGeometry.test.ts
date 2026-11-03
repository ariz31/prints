import assert from "node:assert/strict";
import test from "node:test";
import {paperPickerBounds} from "./paperPickerGeometry.ts";

function within(bounds:ReturnType<typeof paperPickerBounds>,viewport:{width:number;height:number;offsetTop?:number;offsetLeft?:number}){
 const top=viewport.offsetTop??0,left=viewport.offsetLeft??0;
 assert.ok(bounds.maxHeight>0&&bounds.width>0);
 assert.ok(bounds.left>=left&&bounds.left+bounds.width<=left+viewport.width+0.01);
 assert.ok(bounds.top>=top&&bounds.top+bounds.maxHeight<=top+viewport.height+0.01);
}
test("picker stays inside a narrow mobile portrait viewport",()=>{
 const anchor={top:270,bottom:313,left:16,width:318};
 const viewport={width:360,height:740};
 const pos=paperPickerBounds(anchor,viewport);
 within(pos,viewport);
 assert.ok(pos.maxHeight<=340);
 assert.ok(pos.left>=12);
});
test("Android keyboard shrink moves picker above the anchor rather than closing",()=>{
 const anchor={top:340,bottom:382,left:12,width:340};
 const keyboardVisible={width:360,height:430};
 const pos=paperPickerBounds(anchor,keyboardVisible);
 within(pos,keyboardVisible);
 assert.ok(pos.top<anchor.top);
});
test("visual viewport scroll offset and tiny landscape screens remain bounded",()=>{
 const view={width:320,height:220,offsetTop:44,offsetLeft:8};
 const pos=paperPickerBounds({top:150,bottom:193,left:260,width:240},view);
 within(pos,view);
 assert.ok(Number.isFinite(pos.top));
 assert.ok(Number.isFinite(pos.left));
});
test("desktop picker stays anchored beside paper control",()=>{
 const viewport={width:1280,height:860};
 const anchor={top:120,bottom:166,left:50,width:300};
 const pos=paperPickerBounds(anchor,viewport);
 within(pos,viewport);
 assert.equal(pos.top,171);
 assert.equal(pos.left,50);
});
