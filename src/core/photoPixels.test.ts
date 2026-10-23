import assert from "node:assert/strict";
import test from "node:test";
import {
 DEFAULT_ADJUSTMENTS,PHOTO_PRESETS,autoEnhanceFromImage,hasGeometryTransform,
 isNeutralAdjustment,needsPixelProcessing,normalizeAdjustments,rotationCoverScale,validPhotoAdjustments,
} from "./photoAdjustments.ts";
import {processPhotoPixels} from "./photoPixels.ts";
import {tileScratchBounds} from "./highResRaster.ts";

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


test("feathered print-local light brush changes only nearby pixels",()=>{
 const a={...DEFAULT_ADJUSTMENTS,regions:[{kind:"light" as const,
  x:.5,y:.5,radius:.25,strength:75}]};
 assert.equal(validPhotoAdjustments(a),true);
 const original=new Uint8ClampedArray(5*5*4);
 for(let i=0;i<original.length;i+=4)original.set([60,60,60,255],i);
 const result=processPhotoPixels(original,5,5,a);
 assert.ok(result[(2*5+2)*4]>60);
 assert.equal(result[0],60);
 assert.deepEqual(original.slice(0,4),row(60,60,60,255));
});
test("red-eye brush reduces excessive red and keeps skin pixels unchanged",()=>{
 const input=row(220,30,30,255,100,94,86,255);
 const output=processPhotoPixels(input,2,1,{...DEFAULT_ADJUSTMENTS,
  regions:[{kind:"red-eye",x:0,y:0,radius:.25,strength:100}]});
 assert.ok(output[0]<input[0]);
 assert.equal(output[4],input[4]);
});
test("solid backdrop composites transparency only when explicitly selected",()=>{
 const input=row(200,100,20,0,200,100,20,128,40,30,20,255);
 const adjusted={...DEFAULT_ADJUSTMENTS,backgroundColor:"#ffffff"};
 assert.equal(validPhotoAdjustments(adjusted),true);
 const out=processPhotoPixels(input,3,1,adjusted);
 assert.deepEqual([...out.slice(0,4)],[255,255,255,255]);
 assert.equal(out[7],255);
 assert.deepEqual([...out.slice(8,12)],[40,30,20,255]);
 assert.deepEqual(input,row(200,100,20,0,200,100,20,128,40,30,20,255));
});
test("local retouch metadata is capped and validated on import",()=>{
 const region={kind:"light" as const,x:.5,y:.5,radius:.1,strength:60};
 assert.equal(validPhotoAdjustments({...DEFAULT_ADJUSTMENTS,regions:[region]}),true);
 assert.equal(validPhotoAdjustments({...DEFAULT_ADJUSTMENTS,regions:[{...region,radius:0}]}),false);
 assert.equal(validPhotoAdjustments({...DEFAULT_ADJUSTMENTS,regions:Array(21).fill(region)}),false);
 assert.equal(validPhotoAdjustments({...DEFAULT_ADJUSTMENTS,backgroundColor:"url(http://bad)"}),false);
});

test("fine straightening is bounded and rotation cover never exposes empty corners",()=>{
 const edit={...DEFAULT_ADJUSTMENTS,rotation:90,straighten:9};
 assert.equal(validPhotoAdjustments(edit),true);
 assert.equal(hasGeometryTransform(edit),true);
 assert.equal(validPhotoAdjustments({...edit,straighten:16}),false);
 assert.equal(validPhotoAdjustments({...edit,straighten:Number.NaN}),false);
 const result=rotationCoverScale(200,300,9);
 assert.ok(result>1);
 assert.equal(rotationCoverScale(200,300,0),1);
 assert.ok(rotationCoverScale(200,300,90)>=1.5);
 assert.throws(()=>rotationCoverScale(0,300,5),/Invalid/);
});

test("global-coordinate tile processing preserves exposure and vignette appearance",()=>{
 const w=12,h=10;
 const whole=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;whole[p]=80+x*9;whole[p+1]=60+y*5;whole[p+2]=140;whole[p+3]=255;
 }
 const adjustments={...DEFAULT_ADJUSTMENTS,exposure:30,vignette:55};
 const processed=processPhotoPixels(whole,w,h,adjustments);
 const tx=3,ty=2,tw=4,th=5;
 const subset=new Uint8ClampedArray(tw*th*4);
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
  subset.set(whole.subarray(((ty+y)*w+tx+x)*4,((ty+y)*w+tx+x)*4+4),(y*tw+x)*4);
 }
 const out=processPhotoPixels(subset,tw,th,adjustments,{x:tx,y:ty,totalWidth:w,totalHeight:h});
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++)
  assert.deepEqual(Array.from(out.slice((y*tw+x)*4,(y*tw+x)*4+4)),
   Array.from(processed.slice(((ty+y)*w+tx+x)*4,((ty+y)*w+tx+x)*4+4)));
});

test("heal and sharpness match whole-frame pixels when tiles include the clone source ring",()=>{
 const w=53,h=37;
 const original=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  original[i]=(10*x+3*y)%256;original[i+1]=(x+12*y)%256;
  original[i+2]=(17*x+5*y)%256;original[i+3]=255;
 }
 const edits={...DEFAULT_ADJUSTMENTS,exposure:12,sharpness:35,
  regions:[{kind:"heal" as const,x:.35,y:.48,radius:.11,strength:80}]};
 const expected=processPhotoPixels(original,w,h,edits);
 const actual=new Uint8ClampedArray(expected.length);
 const chunk=14,cloneRadius=.11*Math.min(w,h);
 for(let y=0;y<h;y+=chunk)for(let x=0;x<w;x+=chunk){
  const tw=Math.min(chunk,w-x),th=Math.min(chunk,h-y);
  const b=tileScratchBounds(w,h,x,y,tw,th,cloneRadius);
  const sw=b.right-b.left,sh=b.bottom-b.top;
  const scratch=new Uint8ClampedArray(sw*sh*4);
  for(let sy=0;sy<sh;sy++)for(let sx=0;sx<sw;sx++){
   scratch.set(original.subarray(((b.top+sy)*w+b.left+sx)*4,
     ((b.top+sy)*w+b.left+sx)*4+4),(sy*sw+sx)*4);
  }
  const result=processPhotoPixels(scratch,sw,sh,edits,
   {x:b.left,y:b.top,totalWidth:w,totalHeight:h});
  for(let yy=0;yy<th;yy++)for(let xx=0;xx<tw;xx++){
   const src=((y+yy-b.top)*sw+x+xx-b.left)*4;
   actual.set(result.subarray(src,src+4),((y+yy)*w+x+xx)*4);
  }
 }
 assert.deepEqual(actual,expected);
});
