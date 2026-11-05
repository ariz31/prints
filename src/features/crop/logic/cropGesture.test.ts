import {test} from "node:test";
import assert from "node:assert/strict";
import {gestureCrop} from "./cropGesture.ts";
import {exactCropSourceRect} from "./crop.ts";
test("portrait pinch uses physical pixel distance, keeps its source focal point and exact output aspect",()=>{
 const crop={x:.2,y:.1,width:.6,height:.6};
 const next=gestureCrop(crop,[{x:100,y:100},{x:200,y:200}],[{x:50,y:50},{x:250,y:250}],{left:0,top:0,width:300,height:600});
 assert.ok(Math.abs(next.width-.3)<1e-12);assert.ok(Math.abs(next.x-.35)<1e-12);assert.ok(Math.abs(next.y-.175)<1e-12);
 exactCropSourceRect(1000,2000,next,25,50);
});
test("captured pan continues outside viewport, invalid input leaves geometry untouched",()=>{
 const c={x:.2,y:.2,width:.3,height:.3};
 const bounds={left:0,top:0,width:100,height:200};
 assert.equal(gestureCrop(c,[{x:50,y:100}],[{x:-500,y:100}],bounds).x,.7);
 assert.equal(gestureCrop(c,[{x:NaN,y:0}],[{x:1,y:1}],bounds),c);
 assert.equal(gestureCrop(c,[],[],bounds),c);
});
