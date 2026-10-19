import assert from "node:assert/strict";
import test from "node:test";
import {textBoxGeometry,textOverflow,assertTextFits} from "./textLayout.ts";
import type {TextLayer} from "./layers.ts";
const base:TextLayer={id:"label",name:"Text",kind:"text",visible:true,
 x:0,y:0,width:.8,height:.2,color:"#000000",fontSizePt:12,text:"ID"};
test("text height is calculated from layer box, not whole product",()=>{
 const short=textBoxGeometry(base,50.8,50.8);
 assert.ok(Math.abs(short.widthPt-115.2)<.001);
 assert.equal(textOverflow(short),null);
 const tiny=textBoxGeometry({...base,height:.03},50.8,50.8);
 assert.equal(textOverflow(tiny),"height");
 assert.throws(()=>assertTextFits(tiny),/design box height/);
});
test("same physical box fitting is independent of raster DPI",()=>{
 const box=textBoxGeometry({...base,text:"A\nB"},50.8,76.2);
 assert.equal(box.lines.length,2);
 assert.equal(textOverflow(box),null);
});
test("optional font measurement detects actual PDF/PNG width",()=>{
 const box=textBoxGeometry({...base,text:"Long label"},25.4,50.8);
 assert.equal(textOverflow(box,()=>90),"width");
 assert.throws(()=>assertTextFits(box,()=>90),/design box width/);
 assert.doesNotThrow(()=>assertTextFits(box,()=>20));
});
