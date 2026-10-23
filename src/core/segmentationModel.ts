/** On-device foreground segmentation with an explicitly opt-in MediaPipe runtime.
 * Source photographs never leave the browser. Optional runtime metrics may
 * reach the provider; users must consent before a model is downloaded.
 */
const VERSION="0.10.35";
const ROOT="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@"+VERSION;
const MODEL="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
const BUNDLE=ROOT+"/vision_bundle.mjs";
const CACHE_NAME="prints-ai-model-v1";
const MAX_BYTES=18_000_000;
const WASM_SIMD=ROOT+"/wasm/vision_wasm_internal";
const WASM_NOSIMD=ROOT+"/wasm/vision_wasm_nosimd_internal";
export const SEGMENTATION_MODEL_NOTICE="Opt in to downloading MediaPipe AI assets. Photos are processed locally. MediaPipe may collect runtime usage metrics under its privacy notice. Model assets are cached for offline reuse where browser storage permits.";

interface FloatMask {width:number;height:number;getAsFloat32Array():Float32Array;close?():void}
interface SegmentResult {confidenceMasks?:FloatMask[];close?():void}
interface Segmenter {segment:(image:HTMLCanvasElement)=>SegmentResult;close:()=>void}
interface MediaPipeModule {
 ImageSegmenter:{createFromOptions:(fileset:{wasmLoaderPath:string;wasmBinaryPath:string},
   options:{baseOptions:{modelAssetBuffer:Uint8Array;delegate:"CPU"};
    runningMode:"IMAGE";outputConfidenceMasks:true;outputCategoryMask:false})=>Promise<Segmenter>};
}
export interface ForegroundMask {width:number;height:number;data:Float32Array}
async function fromCache(url:string,limit:number,signal:AbortSignal):Promise<Blob>{
 if(typeof caches==="undefined")throw new Error("Model cache is unavailable in this browser.");
 const cache=await caches.open(CACHE_NAME);
 let response=await cache.match(url);
 if(!response){
  if(!navigator.onLine)throw new Error("Connect once to download the optional AI model, or use manual cleanup.");
  response=await fetch(url,{mode:"cors",credentials:"omit",signal,cache:"no-store"});
  if(!response.ok||response.type==="opaque")
   throw new Error("Could not securely load the optional on-device model.");
  const size=Number(response.headers.get("content-length")||0);
  if(size>limit)throw new Error("Model asset is larger than the configured memory limit.");
  const blob=await response.blob();
  if(blob.size<1||blob.size>limit)throw new Error("Invalid AI model download size.");
  await cache.put(url,new Response(blob));
  return blob;
 }
 const blob=await response.blob();
 if(blob.size<1||blob.size>limit)throw new Error("Invalid cached AI model.");
 return blob;
}
/** Not a face-recognition system: confidence mask 1 is 'person' for SelfieSegmenter. */
export async function segmentPersonLocally(image:ImageData,signal:AbortSignal,
 onProgress?:(step:string)=>void):Promise<ForegroundMask>{
 if(signal.aborted)throw new Error("AI operation canceled.");
 if(image.width<1||image.height<1||image.width*image.height>3_000_000)
  throw new Error("AI editor dimensions exceed the safe mobile budget.");
 if(!globalThis.isSecureContext)throw new Error("On-device AI requires HTTPS or localhost.");
 const urls:string[]=[];
 let engine:Segmenter|undefined;
 try{
  onProgress?.("Loading local AI runtime…");
  const moduleBlob=await fromCache(BUNDLE,8_000_000,signal);
  const moduleUrl=URL.createObjectURL(new Blob([moduleBlob],{type:"text/javascript"}));urls.push(moduleUrl);
  const module=await import(/* @vite-ignore */ moduleUrl) as MediaPipeModule;
  if(!module.ImageSegmenter)throw new Error("Unsupported AI segmentation runtime.");
  // The JS and Wasm pair must use the same pinned version and SIMD mode.
  const simd=typeof WebAssembly!=="undefined"&&
   WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123]));
  const prefix=simd?WASM_SIMD:WASM_NOSIMD;
  const [loader,binary,model]=await Promise.all([
   fromCache(prefix+".js",500_000,signal),
   fromCache(prefix+".wasm",MAX_BYTES,signal),
   fromCache(MODEL,8_000_000,signal)
  ]);
  if(signal.aborted)throw new Error("AI operation canceled.");
  const loaderUrl=URL.createObjectURL(new Blob([loader],{type:"text/javascript"}));
  const binaryUrl=URL.createObjectURL(binary);
  urls.push(loaderUrl,binaryUrl);
  onProgress?.("Analyzing subject on this device…");
  engine=await module.ImageSegmenter.createFromOptions(
   {wasmLoaderPath:loaderUrl,wasmBinaryPath:binaryUrl},
   {baseOptions:{modelAssetBuffer:new Uint8Array(await model.arrayBuffer()),delegate:"CPU"},
    runningMode:"IMAGE",outputConfidenceMasks:true,outputCategoryMask:false});
  if(signal.aborted)throw new Error("AI operation canceled.");
  const canvas=document.createElement("canvas");
  canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("On-device AI cannot use the image canvas.");
  ctx.putImageData(image,0,0);
  const prediction=engine.segment(canvas);
  try{
   const masks=prediction.confidenceMasks;
   if(!masks||masks.length<2)throw new Error("AI model did not return foreground confidence.");
   const person=masks[1],values=person.getAsFloat32Array();
   if(person.width*person.height!==values.length)throw new Error("Invalid AI segmentation dimensions.");
   if(signal.aborted)throw new Error("AI operation canceled.");
   return {width:person.width,height:person.height,data:new Float32Array(values)};
  }finally{
   prediction.close?.();
  }
 }finally{
  engine?.close();
  for(const url of urls)URL.revokeObjectURL(url);
 }
}
function bounded(v:number){return Math.max(0,Math.min(1,v));}
/** Deterministic bilinear mask upsample + configurable edge softness.
 * Expects normalised person confidence [0,1] in row-major order.
 */
export function applyPersonMask(
 original:Uint8ClampedArray,w:number,h:number,mask:ForegroundMask,
 threshold=.5,softness=.15,
):Uint8ClampedArray{
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||
    w*h>3_000_000||original.length!==w*h*4||
    !Number.isSafeInteger(mask.width)||!Number.isSafeInteger(mask.height)||
    mask.width<1||mask.height<1||mask.width*mask.height>3_000_000||
    mask.data.length!==mask.width*mask.height||
    !Number.isFinite(threshold)||threshold<.1||threshold>.9||
    !Number.isFinite(softness)||softness<.01||softness>.5)
   throw new Error("Invalid foreground mask parameters.");
 const out=new Uint8ClampedArray(original);
 const sample=(x:number,y:number)=>{
  const mx=bounded(x/Math.max(1,w-1))*(mask.width-1);
  const my=bounded(y/Math.max(1,h-1))*(mask.height-1);
  const x0=Math.floor(mx),y0=Math.floor(my),x1=Math.min(mask.width-1,x0+1),y1=Math.min(mask.height-1,y0+1);
  const fx=mx-x0,fy=my-y0,a=mask.data;
  return (a[y0*mask.width+x0]*(1-fx)+a[y0*mask.width+x1]*fx)*(1-fy)+
    (a[y1*mask.width+x0]*(1-fx)+a[y1*mask.width+x1]*fx)*fy;
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,c=sample(x,y);
  if(!Number.isFinite(c))throw new Error("Invalid AI confidence mask.");
  const alpha=bounded((c-threshold)/softness+.5);
  // No RGB premultiplication here: PNG/Canvas manages alpha; keep original RGB
  // for manual restore brushes and avoid permanently discarding source color.
  out[i+3]=Math.round(out[i+3]*alpha);
 }
 return out;
}
