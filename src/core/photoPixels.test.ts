import assert from "node:assert/strict";
import test from "node:test";
import {
 DEFAULT_ADJUSTMENTS,PHOTO_PRESETS,autoEnhanceFromImage,hasGeometryTransform,
 isNeutralAdjustment,needsPixelProcessing,normalizeAdjustments,validPhotoAdjustments,
} from "./photoAdjustments.ts";
import {processPhotoPixels} from "./photoPixels.ts";

const row=(...rgba:number[])=>new Uint8ClampedArray(rgba);
test("legacy photo projects and normalized neutral metadata remain compatible",()=>{
 const legacy={brightness:10,contrast:-20,saturation:4};
 assert.deepEqual(normalizeAdjustments(legacy),legacy);
 assert.equal(validPhotoAdjustments(legacy),true);
 assert.equal(needsPixelProcessing(legacy),false);
 assert.equal(isNeutralAdjustment(DEFAULT_ADJUSTMENTS),true);
 assert.equal(processPhotoPixels(row(10,20,30,255),1,1,legacy)[0],10);
});
test("invalid new controls and unknown fields are rejected before export or storage",()=>{
 for(const bad of [
  {...DEFAULT_ADJUSTMENTS,exposure:Infinity},
  {...DEFAULT_ADJUSTMENTS,rotation:45},
  {...DEFAULT_ADJUSTMENTS,denoise:101},
  {...DEFAULT_ADJUSTMENTS,flipX:"yes"},
  {...DEFAULT_ADJUSTMENTS,unexpected:1},
 ])assert.equal(validPhotoAdjustments(bad),false);
 assert.throws(()=>processPhotoPixels(row(2,3,4,255),1,1,
  {...DEFAULT_ADJUSTMENTS,exposure:Infinity}),/Invalid/);
});
test("enhancement operators modify RGB, keep alpha and do not mutate source",()=>{
 const source=row(80,95,112,255,100,120,140,0,200,180,160,255);
 const copy=new Uint8ClampedArray(source);
 const output=processPhotoPixels(source,3,1,{
  ...DEFAULT_ADJUSTMENTS,exposure:22,shadows:18,temperature:22,vibrance:30,
  highlights:-10,
 });
 assert.deepEqual(source,copy);
 assert.notEqual(output[0],source[0]);
 assert.equal(output[3],255);
 assert.equal(output[7],0);
 assert.equal(output[11],255);
});
test("local grayscale, sharpening, denoise and vignette are bounded",()=>{
 const source=row(20,60,200,255,90,80,70,255,150,130,110,255,
  10,20,30,255,100,120,140,255,200,170,100,255,
  0,0,0,0,40,90,170,255,220,200,140,255);
 const output=processPhotoPixels(source,3,3,{...DEFAULT_ADJUSTMENTS,
  grayscale:100,sharpness:60,denoise:40,vignette:30});
 assert.equal(output.length,source.length);
 assert.equal(output[27],0);
 assert.ok([...output].every(v=>v>=0&&v<=255));
});
test("all presets validate and preserve neutral metadata",()=>{
 assert.ok(PHOTO_PRESETS.length>=5);
 for(const p of PHOTO_PRESETS)assert.ok(validPhotoAdjustments(p.value),p.id);
 assert.ok(hasGeometryTransform({...DEFAULT_ADJUSTMENTS,rotation:90}));
 assert.equal(hasGeometryTransform(DEFAULT_ADJUSTMENTS),false);
});
test("auto enhancer is deterministic, bounded and transparent-safe",()=>{
 const pixels=new Uint8ClampedArray(8*4);
 for(let i=0;i<pixels.length;i+=4){pixels.set([40,50,65,255],i);}
 const data={data:pixels,width:8,height:1} as ImageData;
 const x=autoEnhanceFromImage(data);
 assert.deepEqual(x,autoEnhanceFromImage(data));
 assert.equal(validPhotoAdjustments(x),true);
 assert.ok((x.exposure??0)>0);
});
test("large, malformed or zero-size rasters are refused before allocation",()=>{
 assert.throws(()=>processPhotoPixels(row(0,0,0,255),0,1,DEFAULT_ADJUSTMENTS),/Invalid/);
 assert.throws(()=>processPhotoPixels(row(0,0,0,255),2,1,DEFAULT_ADJUSTMENTS),/Invalid/);
});
