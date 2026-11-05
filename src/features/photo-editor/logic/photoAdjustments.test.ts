import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ADJUSTMENTS,PHOTO_PRESETS,matchingPhotoPreset,photoFilterCss,validPhotoAdjustments,setCanvasPhotoFilter } from "./photoAdjustments.ts";
test("active photo style reflects applied values and becomes custom on manual editing",()=>{
 for(const preset of PHOTO_PRESETS){
  assert.equal(matchingPhotoPreset(preset.value),preset.id);
 }
 assert.equal(matchingPhotoPreset(undefined),"neutral");
 assert.equal(matchingPhotoPreset({...DEFAULT_ADJUSTMENTS,contrast:0,denoise:0}),"neutral");
 assert.equal(matchingPhotoPreset({...PHOTO_PRESETS[1].value,brightness:3}),null);
 assert.equal(matchingPhotoPreset({...DEFAULT_ADJUSTMENTS,flipX:true}),"neutral");
 assert.equal(matchingPhotoPreset({...DEFAULT_ADJUSTMENTS,backgroundColor:"#ffffff"}),"neutral");
 assert.equal(matchingPhotoPreset({...DEFAULT_ADJUSTMENTS,regions:[
  {kind:"light",x:0.5,y:0.5,radius:0.1,strength:40}
 ]}),"neutral");
 // Undo/redo and stored photo projects expose the same value-derived status.
 assert.equal(matchingPhotoPreset({...PHOTO_PRESETS[1].value}),PHOTO_PRESETS[1].id);
});
test("adjustments are stable and generate CSS canvas-compatible filters",()=>{
 assert.equal(photoFilterCss(),"none");
 assert.equal(photoFilterCss(DEFAULT_ADJUSTMENTS),"brightness(1) contrast(1) saturate(1)");
 assert.equal(photoFilterCss({brightness:20,contrast:-10,saturation:50}),
  "brightness(1.2) contrast(0.9) saturate(1.5)");
});
test("invalid adjustments never reach image pixels or project imports",()=>{
 assert.equal(validPhotoAdjustments({brightness:NaN,contrast:0,saturation:0}),false);
 assert.equal(validPhotoAdjustments({brightness:0,contrast:0,saturation:999}),false);
 assert.throws(()=>photoFilterCss({brightness:101,contrast:0,saturation:0}),/Invalid/);
});

test("editor filter string is assigned unchanged to the exported photo canvas",()=>{
 const canvas={filter:"none"};
 const settings={brightness:27,contrast:-18,saturation:145};
 const filter=photoFilterCss(settings);
 setCanvasPhotoFilter(canvas,settings);
 assert.equal(canvas.filter,filter);
 setCanvasPhotoFilter(canvas);
 assert.equal(canvas.filter,"none");
 setCanvasPhotoFilter(canvas,DEFAULT_ADJUSTMENTS);
 assert.equal(canvas.filter,"none");
});
test("unsupported canvas filters fail clearly rather than silently exporting incorrect pixels",()=>{
 const unsupported={} as {filter:string};
 assert.throws(()=>setCanvasPhotoFilter(unsupported,
   {brightness:50,contrast:0,saturation:0}),/does not support accurate Canvas/);
 const rejecting={get filter(){return "none";},set filter(_value:string){}};
 assert.throws(()=>setCanvasPhotoFilter(rejecting,
   {brightness:50,contrast:0,saturation:0}),/cannot export photo adjustments accurately/);
});
test("valid extreme and neutral adjustment values produce bounded CSS filters",()=>{
 assert.equal(photoFilterCss({brightness:-100,contrast:0,saturation:0}),
  "brightness(0) contrast(1) saturate(1)");
 assert.equal(photoFilterCss({brightness:0,contrast:-100,saturation:-100}),
  "brightness(1) contrast(0) saturate(0)");
 assert.equal(photoFilterCss({brightness:100,contrast:100,saturation:200}),
  "brightness(2) contrast(2) saturate(3)");
 assert.equal(validPhotoAdjustments({brightness:0,contrast:0,saturation:0}),true);
});
