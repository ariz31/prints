import assert from "node:assert/strict";
import test from "node:test";
import {defaultBackgroundRecipe,encodeMask} from "./backgroundRecipe.ts";
import {renderRefinedMask} from "./refinedMask.ts";

test("manual restoration wins over AI threshold, feather and contraction",()=>{
 const width=9,height=9,raw=new Uint8Array(width*height).fill(0);
 const recipe=defaultBackgroundRecipe(raw,width,height);
 recipe.segmentationMode="person";
 recipe.confidence=encodeMask(new Uint8Array(width*height).fill(0),width,height);
 recipe.feather=3;recipe.contract=4;
 recipe.strokes=[{points:[{x:.5,y:.5}],mode:"restore",radius:.11,hardness:1,opacity:1,snap:false}];
 const first=renderRefinedMask(recipe,width,height);
 assert.equal(first[4*width+4],255);
 recipe.threshold=.85;recipe.softness=.01;
 const second=renderRefinedMask(recipe,width,height);
 assert.equal(second[4*width+4],255,"manual correction must remain fully opaque");
 assert.equal(second[0],0);
});
test("manual erase overrides positive AI predictions after all edge adjustments",()=>{
 const width=7,height=7;
 const recipe=defaultBackgroundRecipe(new Uint8Array(width*height).fill(255),width,height);
 recipe.confidence=encodeMask(new Uint8Array(width*height).fill(255),width,height);
 recipe.feather=4;recipe.contract=-4;
 recipe.strokes=[{points:[{x:.5,y:.5}],mode:"erase",radius:.145,hardness:1,opacity:1,snap:false}];
 assert.equal(renderRefinedMask(recipe,width,height)[3*width+3],0);
});
test("refined mask without any strokes preserves existing opaque source",()=>{
 const recipe=defaultBackgroundRecipe(new Uint8Array(25).fill(255),5,5);
 recipe.feather=3;recipe.contract=2;
 assert.deepEqual(renderRefinedMask(recipe,5,5),new Uint8Array(25).fill(255));
});
