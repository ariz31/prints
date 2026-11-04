import assert from "node:assert/strict";
import test from "node:test";
import {
 DEFAULT_ADJUSTMENTS, PHOTO_EDIT_SCHEMA_VERSION,PHOTO_PRESETS,
 blendAutoEnhancement,globalPhotoAdjustments,mergeGlobalPhotoAdjustments,
 isNeutralAdjustment,validPhotoAdjustments,matchingPhotoPreset,photoOpacityFraction
} from "./photoAdjustments.ts";
import {
 makePhotoStyle,parsePhotoStyles,matchingSavedPhotoStyle,samePhotoStyleValues,
 saveNewPhotoStyle,updateSavedPhotoStyle,renameSavedPhotoStyle,removeSavedPhotoStyle
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
  flipX:true,flipY:false,backgroundColor:"#aabbcc",opacity:35,
  regions:[{kind:"light" as const,x:0.25,y:0.75,radius:.08,strength:70}]};
 const global={...PHOTO_PRESETS[1].value,rotation:270,flipY:true,backgroundColor:"#ffffff",opacity:65};
 const clean=globalPhotoAdjustments(global);
 assert.equal("rotation" in clean,false);
 assert.equal("regions" in clean,false);
 assert.equal("backgroundColor" in clean,false);
 assert.equal("opacity" in clean,false);
 const result=mergeGlobalPhotoAdjustments(original,global);
 assert.deepEqual(result.regions,original.regions);
 assert.equal(result.rotation,90);
 assert.equal(result.straighten,-7);
 assert.equal(result.flipX,true);
 assert.equal(result.flipY,false);
 assert.equal(result.backgroundColor,"#aabbcc");
 assert.equal(result.opacity,35);
 assert.equal(result.exposure,PHOTO_PRESETS[1].value.exposure);
 assert.equal(result.brightness,0);
 assert.equal(validPhotoAdjustments(result),true);
 assert.equal(matchingPhotoPreset(result),"portrait");
 assert.equal(original.brightness,4);
});
test("custom style catalog stores global edits only and protects against corrupt data",()=>{
 const source={...PHOTO_PRESETS[3].value,flipX:true,backgroundColor:"#123456",opacity:45,
  regions:[{kind:"heal" as const,x:.4,y:.5,radius:.03,strength:50}]};
 const style=makePhotoStyle("test-1","  Print vivid  ",source);
 assert.equal(style.name,"Print vivid");
 assert.equal(style.schemaVersion,1);
 assert.equal("regions" in style.adjustments,false);
 assert.equal("backgroundColor" in style.adjustments,false);
 assert.equal("opacity" in style.adjustments,false);
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


test("photo opacity is validated, neutral at 100%, and preserves legacy projects",()=>{
 const a={...DEFAULT_ADJUSTMENTS};
 assert.equal(photoOpacityFraction(a),1);
 assert.equal(photoOpacityFraction({...a,opacity:0}),0);
 assert.equal(photoOpacityFraction({...a,opacity:45}),.45);
 assert.equal(validPhotoAdjustments({...a,opacity:0}),true);
 assert.equal(validPhotoAdjustments({...a,opacity:100}),true);
 assert.equal(isNeutralAdjustment({...a,opacity:100}),true);
 assert.equal(isNeutralAdjustment({...a,opacity:0}),false);
 assert.equal(isNeutralAdjustment(a),true);
 for(const opacity of [-1,101,NaN,Infinity,-Infinity,"50",null])
  assert.equal(validPhotoAdjustments({...a,opacity}),false,String(opacity));
});

test("photo style management uses selected IDs, not first matching values",()=>{
 const source={...DEFAULT_ADJUSTMENTS,brightness:12,regions:[]};
 const a=makePhotoStyle("first","Warm",source);
 const b=makePhotoStyle("second","Warm copy",source);
 const library=[a,b]; // Existing libraries can contain duplicate looks.
 assert.equal(matchingSavedPhotoStyle(source,library)?.id,"first");
 assert.deepEqual(removeSavedPhotoStyle(library,"second"),[a]);
 assert.deepEqual(library,[a,b]);
 assert.equal(renameSavedPhotoStyle(library,"second","Summer")[1].name,"Summer");
 assert.throws(()=>renameSavedPhotoStyle(library,"second"," WARM "),/already uses that name/i);
 assert.throws(()=>removeSavedPhotoStyle(library,"missing"),/Choose an existing/);
});
test("new photo styles prevent collisions and enforce library capacity",()=>{
 const base=makePhotoStyle("a","Portrait",PHOTO_PRESETS[1].value);
 const sameLook={...PHOTO_PRESETS[1].value,exposure:10,schemaVersion:PHOTO_EDIT_SCHEMA_VERSION};
 assert.equal(samePhotoStyleValues(base.adjustments,sameLook),true);
 assert.throws(()=>saveNewPhotoStyle([base],"b","portrait",PHOTO_PRESETS[2].value),/already uses that name/);
 assert.throws(()=>saveNewPhotoStyle([base],"b","Another",sameLook),/already saved as/);
 assert.throws(()=>saveNewPhotoStyle([base],"a","Another",PHOTO_PRESETS[2].value),/identifier/);
 const more=saveNewPhotoStyle([base],"b","Document",PHOTO_PRESETS[2].value);
 assert.equal(more.length,2);
 assert.equal(more[1].name,"Document");
 const full=Array.from({length:12},(_,i)=>makePhotoStyle(String(i),"Look "+i,
  {...DEFAULT_ADJUSTMENTS,brightness:i}));
 assert.throws(()=>saveNewPhotoStyle(full,"more","New",PHOTO_PRESETS[3].value),/full/);
});
test("updating photo styles preserves IDs and excludes photo-specific data",()=>{
 const a=makePhotoStyle("id-a","Natural",PHOTO_PRESETS[1].value);
 const b=makePhotoStyle("id-b","Document",PHOTO_PRESETS[2].value);
 const draft={...DEFAULT_ADJUSTMENTS,brightness:27,opacity:10,flipX:true,
  regions:[{kind:"heal" as const,x:.5,y:.5,radius:.05,strength:80}]};
 const updated=updateSavedPhotoStyle([a,b],"id-a",draft);
 assert.equal(updated[0].id,"id-a");
 assert.equal(updated[0].name,"Natural");
 assert.equal(updated[0].adjustments.brightness,27);
 assert.equal("regions" in updated[0].adjustments,false);
 assert.equal("opacity" in updated[0].adjustments,false);
 assert.equal("flipX" in updated[0].adjustments,false);
 assert.equal(updated[1],b);
 assert.equal(a.adjustments.exposure,PHOTO_PRESETS[1].value.exposure);
 assert.throws(()=>updateSavedPhotoStyle([a,b],"id-a",b.adjustments),/already saved as/);
 assert.throws(()=>updateSavedPhotoStyle([a,b],"missing",draft),/Choose an existing/);
});
