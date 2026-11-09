import {useEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties,PointerEvent} from "react";
import type {PhotoAsset} from "../../../domain/models/asset.ts";
import EditorWorkspace from "../../../components/EditorWorkspace.tsx";
import StudioSelect from "../../../components/StudioSelect.tsx";
import PhotoAdjustmentRow from "../../../components/PhotoAdjustmentRow.tsx";
import InlineColorField from "../../../components/InlineColorField.tsx";
import {usePreviewViewport} from "../../../components/usePreviewViewport.ts";
import {removeColorInWorker} from "../workers/backgroundWorkerClient.ts";
import type {RGB} from "../logic/background.ts";
import {encodeMask,defaultBackgroundRecipe,applyStroke,validBackgroundRecipe} from "../logic/backgroundRecipe.ts";
import type {BackgroundRecipe,MaskPoint,MaskStroke} from "../logic/backgroundRecipe.ts";
import {segmentBackgroundInWorker} from "../workers/aiSegmentationClient.ts";
import {previewMask,renderBackgroundFullResolution} from "../workers/backgroundWorkerClient.ts";

interface Props{
 item:PhotoAsset;
 onApply:(blob:Blob,width:number,height:number,recipe?:BackgroundRecipe)=>void;
 onReset:()=>void;onClose:()=>void;
 otherAssets?:PhotoAsset[];
 onApplyBatch?:(results:Array<{item:PhotoAsset;blob:Blob;width:number;height:number;recipe:BackgroundRecipe}>)=>void;
}
type Mode="pan"|"sample"|"object"|"erase"|"restore";
type SavedStyle={name:string;threshold:number;softness:number;feather:number;
 contract:number;decontam:number;backdrop:BackgroundRecipe["backdrop"]};
const PRESETS_KEY="prints-background-styles-v2";
function savedStyles():SavedStyle[]{
 try{
   const value=JSON.parse(localStorage.getItem(PRESETS_KEY)??"[]") as unknown;
   if(!Array.isArray(value))return [];
   return value.filter((v):v is SavedStyle=>{
     if(!v||typeof v!=="object")return false;
     const p=v as SavedStyle;
     return typeof p.name==="string"&&p.name.length>0&&p.name.length<=40&&
       Number.isFinite(p.threshold)&&p.threshold>=.1&&p.threshold<=.9&&
       Number.isFinite(p.softness)&&p.softness>=.01&&p.softness<=.5&&
       Number.isInteger(p.feather)&&p.feather>=0&&p.feather<=6&&
       Number.isInteger(p.contract)&&Math.abs(p.contract)<=4&&
       Number.isFinite(p.decontam)&&p.decontam>=0&&p.decontam<=1&&
       p.backdrop!=null&&
       (p.backdrop.kind==="transparent"||
        p.backdrop.kind==="color"&&typeof p.backdrop.color==="string"&&
          /^#[0-9a-fA-F]{6}$/.test(p.backdrop.color));
   }).slice(0,20);
 }catch{return [];}
}
function load(url:string):Promise<HTMLImageElement>{
 return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>resolve(img);
  img.onerror=()=>reject(new Error("Image could not be decoded."));img.src=url;
 });
}
function pointInCanvas(event:PointerEvent<HTMLCanvasElement>):MaskPoint{
 const canvas=event.currentTarget,box=canvas.getBoundingClientRect();
 return {x:Math.max(0,Math.min(1,(event.clientX-box.left)/Math.max(1,box.width))),
   y:Math.max(0,Math.min(1,(event.clientY-box.top)/Math.max(1,box.height)))};
}
function snapPoint(point:MaskPoint,mask:Uint8Array,w:number,h:number,enabled:boolean):MaskPoint{
 if(!enabled)return point;
 const x=Math.round(point.x*(w-1)),y=Math.round(point.y*(h-1));
 let best=-1,bestPoint=point;
 for(let dy=-6;dy<=6;dy+=2)for(let dx=-6;dx<=6;dx+=2){
  const px=x+dx,py=y+dy;
  if(px<1||py<1||px>=w-1||py>=h-1)continue;
  const value=Math.abs(mask[py*w+px-1]-mask[py*w+px+1])+
    Math.abs(mask[(py-1)*w+px]-mask[(py+1)*w+px]);
  const score=value-Math.hypot(dx,dy)*6;
  if(score>best&&value>65){best=score;bestPoint={x:px/(w-1),y:py/(h-1)};}
 }
 return bestPoint;
}
export default function BackgroundEditorV2({item,onApply,onReset,onClose,otherAssets=[],onApplyBatch}:Props){
 const initial=useMemo(()=>validBackgroundRecipe(item.backgroundEdit)?item.backgroundEdit:null,[item.backgroundEdit]);
 const [mode,setMode]=useState<Mode>("sample");
 const viewport=usePreviewViewport(mode==="pan");
 const canvasRef=viewport.contentRef;
 const sourceRef=useRef<ImageData|null>(null);
 const editingRef=useRef<ImageData|null>(null);
 const alphaRef=useRef<Uint8Array|null>(null);
 const recipeRef=useRef<BackgroundRecipe|null>(initial);
 const [recipe,setRecipe]=useState<BackgroundRecipe|null>(initial);
 const [revision,setRevision]=useState(0);
 const history=useRef<BackgroundRecipe[]>(initial?[initial]:[]);
 const historyIndex=useRef(initial?0:-1);
 const [status,setStatus]=useState("Loading original image…");
 const [ratio,setRatio]=useState(item.pixelWidth/item.pixelHeight);
 const [tolerance,setTolerance]=useState(45);
 const [sample,setSample]=useState<RGB>([255,255,255]);
 const [brushRadius,setBrushRadius]=useState(18);
 const [hardness,setHardness]=useState(80);
 const [opacity,setOpacity]=useState(100);
 const [snap,setSnap]=useState(true);
 const [aiMode,setAiMode]=useState<"person"|"object">(initial?.segmentationMode==="object"?"object":"person");
 const [selectedObject,setSelectedObject]=useState<MaskPoint|null>(null);
 const [aiConsent,setAiConsent]=useState(false);
 const [aiBusy,setAiBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [compare,setCompare]=useState(false);
 const [compareSplit,setCompareSplit]=useState(50);
 const [edgePreview,setEdgePreview]=useState(false);
 const [previewBackground,setPreviewBackground]=useState<"checker"|"white"|"black">("checker");
 const [styles,setStyles]=useState(savedStyles);
 const [presetName,setPresetName]=useState("");
 const [batch,setBatch]=useState(false);
 const [legacyOpaque,setLegacyOpaque]=useState(false);
 const legacyBaseline=useRef<string|null>(null);
 const [batchIds,setBatchIds]=useState<string[]>(()=>otherAssets.map(a=>a.id));
 const active=useRef(false);
 const workingStroke=useRef(false);
 const activePointer=useRef<number|null>(null);
 const remainingStrokePoints=useRef(0);
 const pendingMask=useRef<AbortController|null>(null);
 const activeJob=useRef<AbortController|null>(null);
 const latestPreview=useRef(0);
 const savingRef=useRef(false);
 const latestSave=useRef(0);
 function checkpoint(next:BackgroundRecipe){
   const prior=history.current[historyIndex.current];
   if(prior===next)return;
   history.current=[...history.current.slice(0,historyIndex.current+1),next].slice(-36);
   historyIndex.current=history.current.length-1;setRevision(v=>v+1);
 }
 function drawMask(mask:Uint8Array,region?:{x:number;y:number;width:number;height:number}){
   const source=sourceRef.current,canvas=canvasRef.current;
   if(!source||!canvas||mask.length!==source.width*source.height)return;
   let frame=editingRef.current;
   if(!frame||frame.width!==source.width||frame.height!==source.height){
     frame=new ImageData(new Uint8ClampedArray(source.data),source.width,source.height);
     editingRef.current=frame;
   }
   const x0=region?.x??0,y0=region?.y??0;
   const x1=Math.min(source.width,x0+(region?.width??source.width));
   const y1=Math.min(source.height,y0+(region?.height??source.height));
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
     const i=(y*source.width+x)*4;
     const alpha=mask[y*source.width+x]/255;
     frame.data[i+3]=Math.round(source.data[i+3]*alpha);
     if(edgePreview&&alpha>.05&&alpha<.95){
       frame.data[i]=255;frame.data[i+1]=20;frame.data[i+2]=150;
       frame.data[i+3]=255;
     }else{
       frame.data[i]=source.data[i];frame.data[i+1]=source.data[i+1];frame.data[i+2]=source.data[i+2];
     }
   }
   const ctx=canvas.getContext("2d",{willReadFrequently:true});
   if(ctx)ctx.putImageData(frame,0,0,x0,y0,Math.max(0,x1-x0),Math.max(0,y1-y0));
 }
 function refresh(next=recipeRef.current){
   if(!next||!sourceRef.current)return;
   pendingMask.current?.abort();
   const job=new AbortController();pendingMask.current=job;
   const epoch=++latestPreview.current;
   const {width,height}=sourceRef.current;
   void previewMask(next,width,height,job.signal).then(mask=>{
     if(!active.current||job.signal.aborted||epoch!==latestPreview.current)return;
     alphaRef.current=mask;drawMask(mask);setRevision(v=>v+1);
   }).catch(e=>{if(!job.signal.aborted&&active.current)setStatus(e instanceof Error?e.message:"Preview failed.");});
 }
 function setEditable(next:BackgroundRecipe,record=true){
   recipeRef.current=next;setRecipe(next);
   if(record)checkpoint(next);
   refresh(next);
 }
 function undoRedo(step:-1|1){
   const index=historyIndex.current+step;
   if(index<0||index>=history.current.length)return;
   historyIndex.current=index;
   const next=history.current[index];
   recipeRef.current=next;setRecipe(next);setRevision(v=>v+1);refresh(next);
 }
 function cancelJobs(){pendingMask.current?.abort();activeJob.current?.abort();latestSave.current++;}
 useEffect(()=>{
   active.current=true;let disposed=false;
   void (async()=>{
     const original=await load(item.url);
     const effective=!item.backgroundEdit&&item.processedUrl?
       await load(item.processedUrl):original;
     return {original,effective};
   })().then(({original,effective})=>{
     if(disposed)return;
     const factor=Math.min(1,1600/original.naturalWidth,1600/original.naturalHeight);
     const width=Math.max(1,Math.round(original.naturalWidth*factor));
     const height=Math.max(1,Math.round(original.naturalHeight*factor));
     const canvas=canvasRef.current;if(!canvas)return;
     canvas.width=width;canvas.height=height;setRatio(width/height);
     const ctx=canvas.getContext("2d",{willReadFrequently:true});
     if(!ctx)throw new Error("Canvas editing is unsupported.");
     ctx.drawImage(original,0,0,width,height);
     const source=ctx.getImageData(0,0,width,height);
     sourceRef.current=source;
     ctx.clearRect(0,0,width,height);
     ctx.drawImage(effective,0,0,width,height);
     const effectivePixels=ctx.getImageData(0,0,width,height).data;
     const alpha=new Uint8Array(width*height);
     for(let i=0;i<alpha.length;i++){
       const a=source.data[i*4+3];
       alpha[i]=a?Math.min(255,Math.round(effectivePixels[i*4+3]/a*255)):0;
     }
     const flattened=!!item.processedUrl&&!item.backgroundEdit&&
       alpha.every(value=>value===255);
     setLegacyOpaque(flattened);
     const next=validBackgroundRecipe(item.backgroundEdit)
       ?structuredClone(item.backgroundEdit):defaultBackgroundRecipe(alpha,width,height);
     recipeRef.current=next;setRecipe(next);
     legacyBaseline.current=flattened?next.alpha.encoded:null;
     history.current=[next];historyIndex.current=0;setRevision(v=>v+1);
     setSample([source.data[0],source.data[1],source.data[2]]);
     setStatus(flattened
       ?"This older background is flattened into an opaque image. Its selection cannot be recovered automatically. Run color or AI removal before applying a new cutout."
       :item.processedUrl&&!item.backgroundEdit
       ?"Previous transparent cutout loaded. Review the mask before applying."
       :"Original preserved. Adjust the cutout and apply at full resolution.");
     refresh(next);
   }).catch(e=>{if(!disposed)setStatus(e instanceof Error?e.message:"Image loading failed.");});
   return()=>{disposed=true;active.current=false;cancelJobs();
     const canvas=canvasRef.current;if(canvas){canvas.width=0;canvas.height=0;}
     sourceRef.current=null;editingRef.current=null;alphaRef.current=null;
   };
 },[item.url,item.processedUrl]);
 useEffect(()=>{if(alphaRef.current)drawMask(alphaRef.current);},[edgePreview]);
 function sampleBackground(point:MaskPoint){
   const source=sourceRef.current;if(!source)return;
   const x=Math.min(source.width-1,Math.floor(point.x*source.width));
   const y=Math.min(source.height-1,Math.floor(point.y*source.height));
   const i=(y*source.width+x)*4;
   setSample([source.data[i],source.data[i+1],source.data[i+2]]);
   setStatus("Backdrop color sampled. Choose Remove matching background.");
 }

 function addPoint(point:MaskPoint){
   const current=recipeRef.current,mask=alphaRef.current,source=sourceRef.current;
   if(!current||!mask||!source||!workingStroke.current)return;
   if(remainingStrokePoints.current<=0)return;
   const fixed=snapPoint(point,mask,source.width,source.height,snap);
   const strokes=current.strokes,old=strokes[strokes.length-1];
   if(!old)return;
   const prior=old.points[old.points.length-1];
   if(prior&&Math.hypot((fixed.x-prior.x)*source.width,(fixed.y-prior.y)*source.height)<Math.max(2,brushRadius/3))return;
   // Accumulate the active stroke in its own mutable draft. Render the
   // affected canvas region directly; copying the full path and triggering
   // React on every pointermove causes O(n²) work on mobile.
   old.points.push(fixed);
   remainingStrokePoints.current--;
   applyStroke(mask,source.width,source.height,
     {...old,points:prior?[prior,fixed]:[fixed]});
   const px=fixed.x*(source.width-1),py=fixed.y*(source.height-1),r=brushRadius+8;
   const prevX=(prior?.x??fixed.x)*(source.width-1);
   const prevY=(prior?.y??fixed.y)*(source.height-1);
   const x=Math.max(0,Math.floor(Math.min(px,prevX)-r));
   const y=Math.max(0,Math.floor(Math.min(py,prevY)-r));
   drawMask(mask,{x,y,width:Math.min(source.width-x,Math.ceil(Math.abs(px-prevX)+2*r+2)),
     height:Math.min(source.height-y,Math.ceil(Math.abs(py-prevY)+2*r+2))});
 }
 function down(event:PointerEvent<HTMLCanvasElement>){
   if(saving||aiBusy||!sourceRef.current||!recipeRef.current||mode==="pan"||compare)return;
   const point=pointInCanvas(event);
   if(mode==="sample"){sampleBackground(point);return;}
   if(mode==="object"){setSelectedObject(point);setStatus("Object selected. Run Object AI removal.");return;}
   if(activePointer.current!==null)return;
   const pointsUsed=recipeRef.current.strokes.reduce((total,stroke)=>total+stroke.points.length,0);
   if(recipeRef.current.strokes.length>=2500||pointsUsed>=250000){
     setStatus("This editable mask has reached the maximum safe brush history. Save your project and reset or use another photo.");
     return;
   }
   try{event.currentTarget.setPointerCapture(event.pointerId);}catch{return;}
   activePointer.current=event.pointerId;workingStroke.current=true;
   remainingStrokePoints.current=Math.min(15000,250000-pointsUsed);
   pendingMask.current?.abort();
   const stroke:MaskStroke={
      points:[],mode,radius:Math.min(.5,brushRadius/Math.min(sourceRef.current.width,sourceRef.current.height)),
      hardness:hardness/100,opacity:opacity/100,snap
   };
   const current=recipeRef.current;recipeRef.current={...current,strokes:[...current.strokes,stroke]};
   addPoint(point);
 }
 function move(event:PointerEvent<HTMLCanvasElement>){
   if(activePointer.current===event.pointerId&&workingStroke.current)addPoint(pointInCanvas(event));
 }
 function stop(event:PointerEvent<HTMLCanvasElement>){
   if(activePointer.current!==event.pointerId)return;
   try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{/* already released */}
   activePointer.current=null;workingStroke.current=false;remainingStrokePoints.current=0;
   if(recipeRef.current){
     const current=recipeRef.current;
     const next={...current,strokes:current.strokes.map((stroke,index)=>
       index===current.strokes.length-1?{...stroke,points:[...stroke.points]}:stroke)};
     recipeRef.current=next;setRecipe(next);checkpoint(next);
     refresh(next);
     setStatus("Manual correction added without altering the AI mask.");
   }
 }
 async function removeColor(){
   const source=sourceRef.current,current=recipeRef.current;
   if(!source||!current||saving||aiBusy||compare)return;
   const job=new AbortController();activeJob.current=job;setAiBusy(true);
   try{
     const result=await removeColorInWorker(source.data,source.width,source.height,
       sample,tolerance,job.signal);
     if(!active.current||job.signal.aborted||compare)return;
     setEditable({...current,segmentationMode:"color",
       alpha:encodeMask(result.alpha,source.width,source.height),confidence:undefined});
     setStatus("Removed "+result.removed.toLocaleString()+" connected background pixels.");
   }catch(e){if(!job.signal.aborted)
       setStatus(e instanceof Error?e.message:"Color removal failed.");}
   finally{if(activeJob.current===job){activeJob.current=null;if(active.current)setAiBusy(false);}}
 }
 async function runAI(){
   const source=sourceRef.current;if(!source||!aiConsent||aiBusy||saving||compare)return;
   if(aiMode==="object"&&!selectedObject){setMode("object");setStatus("Tap the object on the preview first.");return;}
   const controller=new AbortController();activeJob.current=controller;setAiBusy(true);
   try{
     const image=new ImageData(new Uint8ClampedArray(source.data),source.width,source.height);
     const mask=await segmentBackgroundInWorker(image,aiMode,selectedObject??{x:.5,y:.5},controller.signal,setStatus);
     if(!active.current||controller.signal.aborted)return;
     const values=new Uint8Array(mask.data.length);
     for(let i=0;i<values.length;i++)values[i]=Math.round(Math.min(1,Math.max(0,mask.data[i]))*255);
     const current=recipeRef.current;if(!current)return;
     setEditable({...current,segmentationMode:aiMode,confidence:encodeMask(values,mask.width,mask.height)});
     setStatus("AI mask ready. Existing manual corrections were preserved.");
   }catch(e){if(!controller.signal.aborted)setStatus("AI unavailable: "+(e instanceof Error?e.message:"Inference failed.")+". Manual tools remain available.");}
   finally{if(activeJob.current===controller){activeJob.current=null;if(active.current)setAiBusy(false);}}
 }
 function changeRecipe(update:(recipe:BackgroundRecipe)=>BackgroundRecipe){
   if(!recipeRef.current||saving||aiBusy||compare)return;
   setEditable(update(recipeRef.current));
 }
 async function uploadBackdrop(file:File|undefined){
   if(!file)return;
   if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<1||file.size>8*1024*1024){
     setStatus("Choose a PNG/JPEG/WebP backdrop no larger than 8 MiB for portable backups.");return;
   }
   try{
     const bitmap=await createImageBitmap(file);
     try{
       if(bitmap.width>6000||bitmap.height>6000||bitmap.width*bitmap.height>16_000_000)
         throw new Error("Choose a background image no larger than 16 megapixels.");
     }finally{bitmap.close();}
     const dataUrl=await new Promise<string>((resolve,reject)=>{
       const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));
       reader.onerror=()=>reject(new Error("Unable to read background file."));
       reader.readAsDataURL(file);
     });
     changeRecipe(r=>({...r,backdrop:{kind:"image",dataUrl,fit:"cover",offsetX:0,offsetY:0}}));
     setStatus("Custom background stored in this editable project.");
   }catch(e){setStatus(e instanceof Error?e.message:"Could not load background.");}
 }
 function savePreset(){
   const current=recipeRef.current;const name=window.prompt("Background preset name (maximum 40 characters):","My background");
   if(!current||!name?.trim())return;
   if(current.backdrop.kind==="image"){setStatus("Use a color background before saving a shared preset; uploaded images remain in the project.");return;}
   const next:SavedStyle={name:name.trim().slice(0,40),threshold:current.threshold,softness:current.softness,
     feather:current.feather,contract:current.contract,decontam:current.decontam,backdrop:current.backdrop};
   const updated=[...styles.filter(s=>s.name!==next.name),next].slice(-20);
   try{localStorage.setItem(PRESETS_KEY,JSON.stringify(updated));setStyles(updated);setPresetName(next.name);
     setStatus("Background style saved locally for reuse.");}
   catch{setStatus("Browser preset storage is full or unavailable.");}
 }
 function selectPreset(name:string){
   setPresetName(name);const saved=styles.find(s=>s.name===name);
   if(!saved)return;
   changeRecipe(r=>({...r,threshold:saved.threshold,softness:saved.softness,
     feather:saved.feather,contract:saved.contract,decontam:saved.decontam,backdrop:saved.backdrop}));
 }
 function removePreset(){
   if(!presetName)return;
   const updated=styles.filter(s=>s.name!==presetName);
   try{localStorage.setItem(PRESETS_KEY,JSON.stringify(updated));setStyles(updated);setPresetName("");
     setStatus("Preset deleted.");}catch{setStatus("Could not delete preset.");}
 }
 /** Legacy opaque composites cannot be inferred as cutouts. Only allow
  * committing after the actual selection/mask differs from that baseline. */
 function canApplyLegacyMask(){
   const current=recipeRef.current;
   return !legacyOpaque||!!current&&(
     current.confidence!==undefined||current.strokes.some(s=>s.mode==="erase"&&s.points.length>0)||
     current.alpha.encoded!==legacyBaseline.current);
 }
 async function apply(){
   const next=recipeRef.current;if(!next||savingRef.current||compare||!canApplyLegacyMask())return;
   const controller=new AbortController();activeJob.current=controller;
   const job=++latestSave.current;savingRef.current=true;setSaving(true);
   try{
     const result=await renderBackgroundFullResolution(item.url,next,controller.signal,
       (done,total)=>{if(active.current&&latestSave.current===job)
         setStatus("Rendering full-resolution image "+Math.round(done/Math.max(1,total)*100)+"%…");});
     if(!active.current||controller.signal.aborted||latestSave.current!==job)return;
     const targets=otherAssets.filter(asset=>batchIds.includes(asset.id));
     if(batch&&targets.length&&onApplyBatch){
       // Every source is separately segmented or color-processed; never copy the first photo's mask.
       const results=[{item,blob:result.blob,width:result.width,height:result.height,recipe:next}];
       const budget=192*1024*1024;
       let bufferedBytes=result.blob.size;
       if(bufferedBytes>budget)
         throw new Error("Batch output exceeds the safe 192 MiB processing budget. Apply this photo individually.");
       for(let i=0;i<targets.length;i++){
         if(controller.signal.aborted)return;
         const other=targets[i];
         setStatus("Processing image "+(i+2)+" of "+(targets.length+1)+"…");
         const image=await load(other.url);
         if(controller.signal.aborted)return;
         const scale=Math.min(1,1200/image.naturalWidth,1200/image.naturalHeight);
         const w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));
         const c=document.createElement("canvas");c.width=w;c.height=h;
         const ctx=c.getContext("2d",{willReadFrequently:true});
         if(!ctx)throw new Error("Could not prepare image "+other.name);
         ctx.drawImage(image,0,0,w,h);
         const frame=ctx.getImageData(0,0,w,h);c.width=0;c.height=0;
         let alpha:Uint8Array,confidence:BackgroundRecipe["confidence"];
         if(next.confidence){
           if(next.segmentationMode!=="person")throw new Error("Object segmentation requires selecting the subject in each image; use Person AI for batch.");
           const mask=await segmentBackgroundInWorker(frame,"person",{x:.5,y:.5},controller.signal,setStatus);
           const values=new Uint8Array(mask.data.length);
           for(let j=0;j<values.length;j++)values[j]=Math.round(Math.max(0,Math.min(1,mask.data[j]))*255);
           confidence=encodeMask(values,mask.width,mask.height);
           alpha=new Uint8Array(w*h).fill(255);
         }else{
           const ownSample:RGB=[frame.data[0],frame.data[1],frame.data[2]];
           const removed=await removeColorInWorker(frame.data,w,h,ownSample,tolerance,controller.signal);
           alpha=removed.alpha;
           confidence=undefined;
         }
         const perImage:BackgroundRecipe={...next,alpha:encodeMask(alpha,w,h),confidence,strokes:[]};
         const output=await renderBackgroundFullResolution(other.url,perImage,controller.signal,
            (done,total)=>{if(active.current&&latestSave.current===job)
              setStatus("Rendering image "+(i+2)+" of "+(targets.length+1)+": "+
                Math.round(done/Math.max(1,total)*100)+"%…");});
         bufferedBytes+=output.blob.size;
         if(bufferedBytes>budget)
           throw new Error("Batch output exceeds 192 MiB; no partial changes were applied. Reduce the selected images.");
         results.push({item:other,blob:output.blob,width:output.width,height:output.height,recipe:perImage});
       }
       if(!controller.signal.aborted&&latestSave.current===job)onApplyBatch(results);
     }else onApply(result.blob,result.width,result.height,next);
   }catch(e){if(!controller.signal.aborted&&active.current)
     setStatus(e instanceof Error?e.message:"Could not export full-resolution cutout.");}
   finally{savingRef.current=false;if(active.current)setSaving(false);if(activeJob.current===controller)activeJob.current=null;}
 }
 const backdrop=recipe?.backdrop;
 const backdropColor=backdrop?.kind==="color"?backdrop.color??"#ffffff":"transparent";
 const overlayStyle:CSSProperties={clipPath:"inset(0 "+(100-compareSplit)+"% 0 0)",
   transform:"translate(-50%,-50%) translate("+viewport.view.x+"px,"+viewport.view.y+
      "px) scale("+viewport.view.scale+")"};
 const transform="translate("+viewport.view.x+"px,"+viewport.view.y+"px) scale("+viewport.view.scale+")";
 const style:CSSProperties={transform,backgroundColor:backdropColor,
   backgroundImage:backdrop?.kind==="image"&&backdrop.dataUrl?"url("+backdrop.dataUrl+")":undefined,
   backgroundPosition:backdrop?.kind==="image"?((backdrop.offsetX??0)+1)*50+"% "+((backdrop.offsetY??0)+1)*50+"%":undefined,
   backgroundSize:backdrop?.fit??"cover",backgroundRepeat:"no-repeat"};
 const ready=!!sourceRef.current&&!!alphaRef.current&&!!recipe;
 const canUndo=historyIndex.current>0,canRedo=historyIndex.current>=0&&historyIndex.current<history.current.length-1;
 void revision;
 const stage=<div className="background-stage" ref={viewport.stageRef} {...viewport.handlers}
   style={{"--background-ratio":ratio,
    backgroundColor:previewBackground==="white"?"white":previewBackground==="black"?"#111":undefined,
    backgroundImage:previewBackground==="checker"?undefined:"none"} as CSSProperties}>
   <canvas ref={canvasRef} aria-label="Background removal preview, click to select a subject or paint the mask"
     style={style} onPointerDown={down} onPointerMove={move} onPointerUp={stop}
     onPointerCancel={stop} onLostPointerCapture={stop}/>
   {compare&&<img className="background-original" src={item.url}
     style={overlayStyle} alt="Original photo on left side of comparison"/>}
   {selectedObject&&aiMode==="object"&&<div className="background-object-layer"
     aria-label="Object selected for removal" style={{transform:overlayStyle.transform}}>
       <span className="background-object-marker" style={{
         left:(selectedObject.x*100)+"%",top:(selectedObject.y*100)+"%"}}/>
   </div>}
  </div>;
 return <EditorWorkspace title="Background Remover" name={item.name} className="background-workspace"
   onCancel={()=>{cancelJobs();onClose();}} onApply={()=>void apply()}
   applyLabel={saving?"Rendering full resolution…":"Apply background"}
   disabled={!ready||aiBusy||saving||compare||(!canApplyLegacyMask())} stage={stage}
   undo={()=>{if(!aiBusy&&!saving&&!compare)undoRedo(-1);}} redo={()=>{if(!aiBusy&&!saving&&!compare)undoRedo(1);}}
   canUndo={canUndo&&!aiBusy&&!saving&&!compare} canRedo={canRedo&&!aiBusy&&!saving&&!compare}
   tools={<>
    <button className="secondary-button" disabled={aiBusy||saving} onClick={()=>setCompare(v=>!v)} aria-pressed={compare}>Compare original</button>
    {compare&&<PhotoAdjustmentRow id="bgv2-compare" label="Before/after split" value={compareSplit}
       min={0} max={100} resetValue={50} onChange={setCompareSplit}/>}
    <button className="secondary-button" onClick={()=>viewport.zoom(1)}>Fit</button>
    <PhotoAdjustmentRow id="background-preview-zoom" label="Zoom" unit="%" value={Math.round(viewport.view.scale*100)}
       min={100} max={250} resetValue={100} onChange={v=>viewport.zoom(v/100)}/>
    <span role="status" aria-live="polite">{status}</span>
   </>}>
   <h2>Quick removal</h2>
   <fieldset className="editor-fieldset" disabled={!ready||saving||aiBusy||compare}>
     <div className="background-controls">
       <label>Tool<StudioSelect value={mode} onChange={e=>setMode(e.target.value as Mode)}>
         <option value="pan">Pan / pinch</option><option value="sample">Sample background color</option>
         <option value="object">Select object (tap photo)</option><option value="erase">Smart erase</option>
         <option value="restore">Smart restore</option>
       </StudioSelect></label>
       <label>AI subject<StudioSelect value={aiMode} onChange={e=>{const next=e.target.value as "person"|"object";setAiMode(next);if(next==="object"){setBatch(false);setMode("object");}}}>
         <option value="person">Person</option><option value="object">Selected object</option>
       </StudioSelect></label>
       <PhotoAdjustmentRow id="background-tolerance" label="Color tolerance" value={tolerance}
         min={0} max={150} resetValue={45} onChange={setTolerance}/>
       <span className="sample-chip" title="Currently sampled background color"
         aria-label="Currently sampled background color" style={{
           backgroundColor:"rgb("+sample.join(",")+")"
         }}/>
     </div>
     <div className="background-actions">
       <button className="secondary-button" onClick={()=>void removeColor()}>Remove matching background</button>
       <label className="check-row">
         <input type="checkbox" checked={aiConsent} onChange={e=>setAiConsent(e.target.checked)}/>
         Allow local AI model download and possible provider metrics
       </label>
       <button className="primary-button" disabled={!aiConsent} onClick={()=>void runAI()}>
         {aiBusy?"Running AI…":"Remove background (AI)"}
       </button>
     </div>
   </fieldset>
   {aiBusy&&<button className="secondary-button" onClick={()=>{activeJob.current?.abort();setAiBusy(false);
     setStatus("AI canceled.");}}>Cancel AI</button>}
   <details className="advanced-options"><summary>Fine edges & precision brushes</summary>
     <fieldset className="editor-fieldset" disabled={!ready||saving||aiBusy||compare}>
       <div className="background-controls">
         <PhotoAdjustmentRow id="background-brush-radius" label="Brush radius" unit="px" value={brushRadius}
           min={2} max={100} resetValue={18} onChange={setBrushRadius}/>
         <PhotoAdjustmentRow id="bgv2-hard" label="Brush hardness" unit="%" value={hardness}
           min={0} max={100} resetValue={80} onChange={setHardness}/>
         <PhotoAdjustmentRow id="bgv2-opacity" label="Brush opacity" unit="%" value={opacity}
           min={1} max={100} resetValue={100} onChange={setOpacity}/>
         <label className="check-row"><input type="checkbox" checked={snap}
           onChange={e=>setSnap(e.target.checked)}/>Snap to nearby subject edges</label>
         <PhotoAdjustmentRow id="background-ai-threshold" label="AI threshold" unit="%"
           value={Math.round((recipe?.threshold??.5)*100)} min={10} max={90} resetValue={50}
           onChange={v=>changeRecipe(r=>({...r,threshold:v/100}))}/>
         <PhotoAdjustmentRow id="background-ai-softness" label="AI softness" unit="%"
           value={Math.round((recipe?.softness??.15)*100)} min={1} max={50} resetValue={15}
           onChange={v=>changeRecipe(r=>({...r,softness:v/100}))}/>
         <PhotoAdjustmentRow id="background-edge-softness" label="Edge feather" unit="px"
           value={recipe?.feather??0} min={0} max={6} resetValue={0}
           onChange={v=>changeRecipe(r=>({...r,feather:v}))}/>
         <PhotoAdjustmentRow id="bgv2-contract" label="Edge contraction" unit="px"
           value={recipe?.contract??0} min={-4} max={4} resetValue={0}
           onChange={v=>changeRecipe(r=>({...r,contract:v}))}/>
         <PhotoAdjustmentRow id="bgv2-defringe" label="Color spill removal" unit="%"
           value={Math.round((recipe?.decontam??0)*100)} min={0} max={100} resetValue={0}
           onChange={v=>changeRecipe(r=>({...r,decontam:v/100}))}/>
       </div>
     </fieldset>
   </details>
   <h2>Replacement background</h2>
   <fieldset className="editor-fieldset" disabled={!ready||saving||aiBusy||compare}>
    <div className="background-actions">
     <label>Background<StudioSelect value={backdrop?.kind??"transparent"}
       onChange={e=>changeRecipe(r=>({...r,backdrop:e.target.value==="transparent"?
         {kind:"transparent"}:e.target.value==="image"?
         {...r.backdrop,kind:"image"}:{kind:"color",color:r.backdrop.color??"#ffffff"}}))}>
       <option value="transparent">Transparent</option><option value="color">Solid color</option>
       {backdrop?.dataUrl&&<option value="image">Local image</option>}
     </StudioSelect></label>
     {backdrop?.kind==="color"&&<InlineColorField label="Background color" value={backdropColor}
       onChange={color=>changeRecipe(r=>({...r,backdrop:{kind:"color",color}}))}/>}
     <label>Custom image (saved in project)
       <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
         onChange={e=>void uploadBackdrop(e.target.files?.[0])}/>
     </label>
     {backdrop?.kind==="image"&&<>
       <label>Image fit<StudioSelect value={backdrop.fit??"cover"}
         onChange={e=>changeRecipe(r=>({...r,backdrop:{...r.backdrop,fit:e.target.value as "cover"|"contain"}}))}>
         <option value="cover">Cover</option><option value="contain">Contain</option>
       </StudioSelect></label>
       <PhotoAdjustmentRow id="bgv2-x" label="Background X" unit="%"
         value={Math.round((backdrop.offsetX??0)*100)} min={-100} max={100} resetValue={0}
         onChange={v=>changeRecipe(r=>({...r,backdrop:{...r.backdrop,offsetX:v/100}}))}/>
       <PhotoAdjustmentRow id="bgv2-y" label="Background Y" unit="%"
         value={Math.round((backdrop.offsetY??0)*100)} min={-100} max={100} resetValue={0}
         onChange={v=>changeRecipe(r=>({...r,backdrop:{...r.backdrop,offsetY:v/100}}))}/>
     </>}
    </div>
   </fieldset>
   <details className="advanced-options"><summary>Preview, presets & batch</summary>
     <div className="background-actions">
       <label>Preview surface<StudioSelect value={previewBackground}
         onChange={e=>setPreviewBackground(e.target.value as typeof previewBackground)}>
         <option value="checker">Transparency checkerboard</option><option value="white">White</option>
         <option value="black">Black</option>
       </StudioSelect></label>
       <label className="check-row"><input type="checkbox" checked={edgePreview}
         onChange={e=>setEdgePreview(e.target.checked)}/>Highlight semi-transparent edges</label>
       <label>Saved style<StudioSelect value={presetName} onChange={e=>selectPreset(e.target.value)}>
          <option value="">Choose preset</option>
          {styles.map(s=><option value={s.name} key={s.name}>{s.name}</option>)}
       </StudioSelect></label>
       <button className="secondary-button" onClick={savePreset}>Save style preset</button>
       {presetName&&<button className="secondary-button" onClick={removePreset}>Delete preset</button>}
       {otherAssets.length>0&&onApplyBatch&&
         <label className="check-row"><input type="checkbox" checked={batch} disabled={saving||aiBusy||compare||aiMode==="object"||recipe?.segmentationMode==="object"}
           onChange={e=>setBatch(e.target.checked)}/>
           Apply to {batchIds.length+1} selected photos (independent masks)
         </label>}
       {batch&&onApplyBatch&&<fieldset className="editor-fieldset"
          disabled={saving||aiBusy||compare}>
         <legend>Additional images</legend>
         {otherAssets.map(asset=><label className="check-row" key={asset.id}>
           <input type="checkbox" checked={batchIds.includes(asset.id)}
             onChange={e=>setBatchIds(ids=>e.target.checked
                ? [...new Set([...ids,asset.id])]
                : ids.filter(id=>id!==asset.id))}/>
           {asset.name}
         </label>)}
       </fieldset>}
     </div>
   </details>
   <p className="hint">{!canApplyLegacyMask()?"The previous opaque background cannot be reconstructed; select a new cutout before Apply. ":""}All edits are reversible in saved PRINTS projects. Original photo pixels are preserved.
     Full-resolution PNG is rendered on Apply. For object AI, select a subject on the preview first.</p>
   <div className="background-actions">
     <button className="secondary-button" disabled={!ready||saving||aiBusy||compare}
       onClick={()=>{const source=sourceRef.current;if(!source)return;
         const alpha=new Uint8Array(source.width*source.height).fill(255);
         setEditable(defaultBackgroundRecipe(alpha,source.width,source.height));}}>
       Reset mask and background</button>
     <button className="secondary-button" disabled={saving||aiBusy||compare}
       onClick={()=>{cancelJobs();onReset();onClose();}}>Remove processed version</button>
   </div>
 </EditorWorkspace>;
}
