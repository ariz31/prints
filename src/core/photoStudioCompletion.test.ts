import assert from "node:assert/strict";
import test from "node:test";
import {
 DEFAULT_ADJUSTMENTS, PHOTO_EDIT_SCHEMA_VERSION,PHOTO_PRESETS,
 blendAutoEnhancement,globalPhotoAdjustments,mergeGlobalPhotoAdjustments,
 isNeutralAdjustment,validPhotoAdjustments,matchingPhotoPreset
} from "./photoAdjustments.ts";
import {
 makePhotoStyle,parsePhotoStyles,matchingSavedPhotoStyle
} from "./photoStyleLibrary.ts";

test("legacy v0 edits still validate, and version 1 edits reject unknown revisions",()=>{
 const legacy={brightness:10,contrast:-4,saturation:0};
 assert.equal(validPhotoAdjustments(legacy),true);
 const newEdit={...legacy,schemaVersion:PHOTO_EDIT_SCHEMA_VERSION};
 assert.equal(validPhotoAdjustments(newEdit),true);
 assert.deepEqual(JSON.parse(JSON.stringify(newEdit)),newEdit);
 assert.equal(validPhotoAdjustments({...legacy,schemaVersion:2}),false);
 assert.equal(isNeutralAdjustment({...DEFAULT_ADJUSTMENTS,schemaVersion:1}),true);
});
test("Auto Enhance strength is bounded, deterministic, resettable and linear",()=>{
 const analysis={...DEFAULT_ADJUSTMENTS,exposure:40,temperature:-20,vibrance:25,highlights:-13};
 const original=structuredClone(analysis);
 assert.deepEqual(blendAutoEnhancement(analysis,100).exposure,40);
 const half=blendAutoEnhancement(analysis,50);
 assert.deepEqual([half.exposure,half.temperature,half.vibrance,half.highlights],[20,-10,13,-6]);
 assert.equal(validPhotoAdjustments(half),true);
 assert.equal(isNeutralAdjustment(blendAutoEnhancement(analysis,0)),true);
 assert.deepEqual(analysis,original);
 for(const invalid of [-1,101,NaN,Infinity,.5]){
  assert.throws(()=>blendAutoEnhancement(analysis,invalid),/Invalid Auto Enhance/);
 }
 assert.throws(()=>blendAutoEnhancement({...analysis,exposure:Infinity},80),/Invalid Auto Enhance/);
});
test("batch/global edits preserve scene-specific geometry, brush positions and backgrounds",()=>{
 const original={...DEFAULT_ADJUSTMENTS,brightness:4,rotation:90,straighten:-7,
  flipX:true,flipY:false,backgroundColor:"#aabbcc",
  regions:[{kind:"light" as const,x:0.25,y:0.75,radius:.08,strength:70}]};
 const global={...PHOTO_PRESETS[1].value,rotation:270,flipY:true,backgroundColor:"#ffffff"};
 const clean=globalPhotoAdjustments(global);
 assert.equal("rotation" in clean,false);
 assert.equal("regions" in clean,false);
 assert.equal("backgroundColor" in clean,false);
 const result=mergeGlobalPhotoAdjustments(original,global);
 assert.deepEqual(result.regions,original.regions);
 assert.equal(result.rotation,90);
 assert.equal(result.straighten,-7);
 assert.equal(result.flipX,true);
 assert.equal(result.flipY,false);
 assert.equal(result.backgroundColor,"#aabbcc");
 assert.equal(result.exposure,PHOTO_PRESETS[1].value.exposure);
 assert.equal(result.brightness,0);
 assert.equal(validPhotoAdjustments(result),true);
 assert.equal(matchingPhotoPreset(result),"portrait");
 assert.equal(original.brightness,4);
});
test("custom style catalog stores global edits only and protects against corrupt data",()=>{
 const source={...PHOTO_PRESETS[3].value,flipX:true,backgroundColor:"#123456",
  regions:[{kind:"heal" as const,x:.4,y:.5,radius:.03,strength:50}]};
 const style=makePhotoStyle("test-1","  Print vivid  ",source);
 assert.equal(style.name,"Print vivid");
 assert.equal(style.schemaVersion,1);
 assert.equal("regions" in style.adjustments,false);
 assert.equal("backgroundColor" in style.adjustments,false);
 assert.equal("flipX" in style.adjustments,false);
 const roundtrip=parsePhotoStyles(JSON.parse(JSON.stringify([style])));
 assert.deepEqual(roundtrip,[style]);
 assert.equal(matchingSavedPhotoStyle(source,roundtrip)?.id,style.id);
 assert.deepEqual(parsePhotoStyles([style,{...style,id:style.id}]),[style]);
 assert.deepEqual(parsePhotoStyles([{...style,adjustments:{...style.adjustments,exposure:Infinity}}]),[]);
 assert.deepEqual(parsePhotoStyles([{...style,schemaVersion:2}]),[]);
 assert.throws(()=>makePhotoStyle("invalid id!","Any",source),/valid photo style/);
 assert.throws(()=>makePhotoStyle("id"," ",source),/valid photo style/);
 assert.equal(parsePhotoStyles(Array.from({length:15},(_,i)=>({...style,id:String(i)}))).length,12);
});
