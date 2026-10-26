import test from "node:test";
import assert from "node:assert/strict";
import {
 INITIAL_PREVIEW_VIEW,clampPreviewView,panPreviewView,pinchPreviewView,zoomPreviewView,
} from "./photoViewport.ts";

const stage={width:300,height:400};
const portrait={width:200,height:400};
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<0.0001,
 `Expected ${actual} to equal ${expected}`);

test("single-finger drag cannot displace the image or canvas at 100%",()=>{
 assert.deepEqual(panPreviewView(INITIAL_PREVIEW_VIEW,80,120,stage,portrait),INITIAL_PREVIEW_VIEW);
});

test("two-finger pinch zooms around midpoint without moving page layout",()=>{
 const zoomed=pinchPreviewView(INITIAL_PREVIEW_VIEW,
  [{x:150,y:150},{x:150,y:250}],
  [{x:150,y:100},{x:150,y:300}],stage,portrait);
 near(zoomed.scale,2);
 near(zoomed.x,0);near(zoomed.y,0);
 // The image stays contained horizontally until its scaled width exceeds stage.
 const panned=panPreviewView(zoomed,45,70,stage,portrait);
 near(panned.x,45);near(panned.y,70);
});

test("moving pinch midpoint preserves focal point while magnifying",()=>{
 const square={width:600,height:600};
 const viewport={width:300,height:300};
 const before:[{x:number;y:number},{x:number;y:number}]=[{x:120,y:135},{x:180,y:135}];
 const after:[{x:number;y:number},{x:number;y:number}]=[{x:110,y:130},{x:230,y:130}];
 const result=pinchPreviewView(INITIAL_PREVIEW_VIEW,before,after,viewport,square);
 near(result.scale,2);
 // Midpoint shifted from (150,135) to (170,130): translation compensates
 // for the changed center-relative image coordinates.
 near(result.x,20);near(result.y,10);
});

test("pinch back to 100% resets translation even after moving midpoint",()=>{
 const zoomed={scale:2,x:55,y:-60};
 const result=pinchPreviewView(zoomed,
  [{x:100,y:180},{x:200,y:180}],
  [{x:130,y:195},{x:180,y:195}],stage,portrait);
 assert.deepEqual(result,INITIAL_PREVIEW_VIEW);
});

test("zoom slider and drag clamp against visible content, not source pixels",()=>{
 const zoomed=zoomPreviewView(INITIAL_PREVIEW_VIEW,2.5,stage,portrait);
 const panned=panPreviewView(zoomed,1000,-1000,stage,portrait);
 near(panned.x,100);near(panned.y,-300);
 assert.deepEqual(zoomPreviewView(panned,1,stage,portrait),INITIAL_PREVIEW_VIEW);
});

test("zero-distance pinch and invalid deltas never corrupt preview transform",()=>{
 const view={scale:1.5,x:0,y:0};
 assert.deepEqual(pinchPreviewView(view,
  [{x:1,y:1},{x:1,y:1}],[{x:0,y:0},{x:10,y:10}],stage,portrait),view);
 const v=panPreviewView(view,Number.NaN,Number.POSITIVE_INFINITY,stage,portrait);
 assert.equal(v.scale,1.5);assert.equal(v.x,0);assert.equal(v.y,0);
 assert.deepEqual(clampPreviewView({scale:Number.NaN,x:100,y:1},stage,portrait),INITIAL_PREVIEW_VIEW);
});

test("pinch zoom cannot exceed 250% or underflow beneath 100%",()=>{
 const expanded=pinchPreviewView(INITIAL_PREVIEW_VIEW,
  [{x:140,y:200},{x:160,y:200}],
  [{x:50,y:200},{x:250,y:200}],stage,portrait);
 near(expanded.scale,2.5);
 const contracted=pinchPreviewView(expanded,
  [{x:50,y:200},{x:250,y:200}],
  [{x:149,y:200},{x:151,y:200}],stage,portrait);
 assert.deepEqual(contracted,INITIAL_PREVIEW_VIEW);
});
