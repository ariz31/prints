import {useEffect,useRef,useState} from "react";
import type {CSSProperties,PointerEvent} from "react";
import EditorWorkspace from "./EditorWorkspace.tsx";
import {useCropRaster} from "./useCropRaster.ts";
import {useEditorHistory} from "./useEditorHistory.ts";
import {gestureCrop} from "../core/cropGesture.ts";
import {DEFAULT_ADJUSTMENTS} from "../core/photoAdjustments.ts";
import {zoomCrop,FULL_CROP} from "../core/crop.ts";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {fitCropToAspect} from "../core/crop.ts";
import type {CropRegion} from "../core/crop.ts";
import {frameIdFace,ID_SIZES,customIdSize} from "../core/idPhoto.ts";
import type {FaceBounds,IdSize} from "../core/idPhoto.ts";

interface Props {
 item:PhotoAsset;
 onCreate:(variants:{size:IdSize;crop:CropRegion}[],quantity:number,backgroundColor?:string)=>void;
 onOpenCrop:()=>void;
 onOpenBackground:()=>void;
 onClose:()=>void;
}
interface NativeFaceDetector {
 detect:(image:HTMLImageElement)=>Promise<Array<{boundingBox:FaceBounds}>>;
}
type FaceDetectorClass=new(options:{fastMode:boolean;maxDetectedFaces:number})=>NativeFaceDetector;
function loadImage(url:string):Promise<HTMLImageElement>{
 return new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve(image);
  image.onerror=()=>reject(new Error("The photo cannot be decoded."));
  image.src=url;
 });
}
/** Optional native on-device analysis only. Face rectangles are ephemeral. */
async function detectLocalFace(url:string):Promise<FaceBounds[]>{
 const factory=(window as unknown as {FaceDetector?:FaceDetectorClass}).FaceDetector;
 if(!factory)throw new Error("Automatic face detection is unavailable in this browser. Use manual Crop to position the portrait.");
 const image=await loadImage(url);
 const results=await new factory({fastMode:false,maxDetectedFaces:5}).detect(image);
 if(!results.length)throw new Error("No face detected. Use manual Crop to position the photo.");
 const faces=results.filter(result=>{
  const b=result.boundingBox;
  return Number.isFinite(b.x)&&Number.isFinite(b.y)&&b.width>0&&b.height>0;
 }).sort((a,b)=>b.boundingBox.width*b.boundingBox.height-a.boundingBox.width*a.boundingBox.height);
 if(!faces.length)throw new Error("No valid face bounds detected.");
 return faces.map(entry=>entry.boundingBox);
}
export default function IdPhotoStudio({item,onCreate,onOpenCrop,onOpenBackground,onClose}:Props){
 const [selected,setSelected]=useState<string[]>(["id-1x1","id-2x2"]);
 const [customWidth,setCustomWidth]=useState("35");
 const [customHeight,setCustomHeight]=useState("45");
 const [active,setActive]=useState("id-2x2");
 const history=useEditorHistory<{face:FaceBounds|null;headroom:number;crops:Record<string,CropRegion>}>(()=>({face:null,headroom:13,crops:{}}));
 const {face,headroom,crops}=history.value;
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const [retry,setRetry]=useState(0);
 const [compare,setCompare]=useState(false);
 const [faces,setFaces]=useState<FaceBounds[]>([]);
 const [faceIndex,setFaceIndex]=useState(0);

 const [busy,setBusy]=useState(false);
 const alive=useRef(true);
 const analyzeGeneration=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;analyzeGeneration.current++;};},[]);
 const [notice,setNotice]=useState("The exact visible crop is used for every generated ID size.");
 const [copies,setCopies]=useState(4);
 const [background,setBackground]=useState("transparent");
 const iw=item.processedWidth??item.pixelWidth,ih=item.processedHeight??item.pixelHeight;
 const custom=customIdSize(customWidth,customHeight);
 const sizes=custom?[...ID_SIZES,custom]:[...ID_SIZES];
 const validSelection=selected.length>0&&(!selected.includes("id-custom")||custom!==null);
 const activeSize=sizes.find(s=>s.id===active)??ID_SIZES[0];
 const cropFor=(size:IdSize):CropRegion=>crops[size.id]?fitCropToAspect(crops[size.id],iw,ih,size.widthMm,size.heightMm):(face
  ?frameIdFace(face,iw,ih,size.widthMm,size.heightMm,headroom/100)
  :fitCropToAspect(item.crop,iw,ih,size.widthMm,size.heightMm));
 const crop=cropFor(activeSize);
 const raster=useCropRaster({...item,widthMm:activeSize.widthMm,heightMm:activeSize.heightMm,crop,
  adjustments:background==="transparent"?item.adjustments:{...DEFAULT_ADJUSTMENTS,...item.adjustments,backgroundColor:background}},true,retry);
 const base=fitCropToAspect(FULL_CROP,iw,ih,activeSize.widthMm,activeSize.heightMm);
 const zoom=base.width/crop.width;
 const cropRef=useRef(crop);cropRef.current=crop;
 function changeCrop(next:CropRegion){analyzeGeneration.current++;setBusy(false);history.change({...history.value,crops:{...crops,[activeSize.id]:next}},"crop-"+active);}
 function pointerDown(event:PointerEvent<HTMLDivElement>){
  if(compare||!raster.ready||pointers.current.size>=2||(event.pointerType==="mouse"&&event.button!==0))return;
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch{return;}
  pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
 }
 function pointerMove(event:PointerEvent<HTMLDivElement>){
  if(!pointers.current.has(event.pointerId))return;
  const before=[...pointers.current.values()];pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  changeCrop(gestureCrop(cropRef.current,before,[...pointers.current.values()],event.currentTarget.getBoundingClientRect()));
 }
 function pointerEnd(event:PointerEvent<HTMLDivElement>){pointers.current.delete(event.pointerId);}

 async function autoAlign(){
  const generation=++analyzeGeneration.current;
  setBusy(true);
  try {
   const result=await detectLocalFace(item.processedUrl??item.url);
   frameIdFace(result[0],iw,ih,activeSize.widthMm,activeSize.heightMm,headroom/100);
   if(!alive.current||generation!==analyzeGeneration.current)return;
   history.set({face:result[0],headroom,crops:{}});setFaces(result);setFaceIndex(0);
   setNotice(result.length>1
    ?"Multiple faces detected. Choose your subject below, then review the crop."
    :"Face framed locally. Review headroom and inspect each size before printing.");
  }catch(error){if(alive.current&&generation===analyzeGeneration.current)
    setNotice(error instanceof Error?error.message:"Face detection failed.");}
  finally{if(alive.current&&generation===analyzeGeneration.current)setBusy(false);}
 }
 const stage=<div className="crop-view id-crop-view" aria-label={"Exact "+activeSize.label+" ID crop preview"}
   role="group" tabIndex={0} style={{aspectRatio:String(activeSize.widthMm/activeSize.heightMm),
    "--crop-ratio":activeSize.widthMm/activeSize.heightMm} as CSSProperties}
   onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd}
   onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}>
   {(compare||raster.url)&&<img src={compare?item.url:raster.url} alt={item.name} draggable={false}
     onLoad={compare?undefined:event=>raster.loaded(event.currentTarget.src)}
     onError={compare?()=>{
       setCompare(false);
       setNotice("Original photo unavailable for comparison. Your edited crop remains unchanged.");
     }:raster.failed}
     style={{inset:0,width:"100%",height:"100%",objectFit:compare?"contain":"fill"}}/>}
   {!raster.ready&&!compare&&<span className="crop-loading" role="status">Updating ID preview…</span>}
   {!compare&&<><div className="crop-grid" aria-hidden="true"/><div className="id-head-guide" aria-hidden="true"/></>}
  </div>;
 return <EditorWorkspace title="Smart ID photos" name={item.name} className="id-workspace" onCancel={onClose}
  onApply={()=>onCreate(sizes.filter(s=>selected.includes(s.id)).map(size=>({size,crop:cropFor(size)})),copies,background==="transparent"?undefined:background)}
  applyLabel={"Create "+selected.length+" designs"} disabled={!validSelection||!raster.ready||compare||busy}
  undo={()=>{analyzeGeneration.current++;setBusy(false);history.undo();}} redo={()=>{analyzeGeneration.current++;setBusy(false);history.redo();}}
  canUndo={history.canUndo} canRedo={history.canRedo} stage={stage}
  tools={<><strong>{activeSize.label} · {activeSize.widthMm} × {activeSize.heightMm} mm</strong>
    <button className="secondary-button" aria-pressed={compare} onClick={()=>setCompare(v=>!v)}>{compare?"Viewing original":"Compare original"}</button></>}>
  {raster.error&&<p className="banner danger" role="alert">{raster.error}<button className="secondary-button" onClick={()=>setRetry(v=>v+1)}>Retry preview</button></p>}
  <h2>Portrait framing</h2>
  <p className="hint">Drag or pinch the preview. Guides suggest headroom and centering; check the required ID standard.</p>
  <label>Zoom · {Math.round(zoom*100)}%<input type="range" min="1" max="8" step=".01" value={zoom}
    onChange={event=>changeCrop(zoomCrop(crop,Number(event.target.value)/zoom))}/></label>
  <button className="secondary-button" onClick={()=>changeCrop(base)}>Fit portrait</button>
  <div className="crop-actions" style={{flexWrap:"wrap"}}>
   <button className="secondary-button" disabled={busy} onClick={()=>void autoAlign()}>
    {busy?"Checking locally…":"Auto-align face (when supported)"}</button>
   <button className="secondary-button" onClick={onOpenCrop}>Manual crop</button>
   <button className="secondary-button" onClick={onOpenBackground}>Background editor</button>
   {face&&<button className="secondary-button" onClick={()=>{history.set({face:null,headroom:13,crops:{}});setFaces([]);setNotice("Manual crop restored.");}}>Reset face alignment</button>}
  </div>
  {faces.length>1&&<label>Portrait subject
   <select value={faceIndex} onChange={event=>{
    const index=Number(event.target.value);
    if(Number.isInteger(index)&&faces[index]){setFaceIndex(index);history.set({face:faces[index],headroom,crops:{}});}
   }}>
    {faces.map((_,index)=><option key={index} value={index}>Face {index+1}</option>)}
   </select>
  </label>}
  {face&&<label className="crop-zoom">Headroom {headroom}%
   <input type="range" min="0" max="35" value={headroom}
    onChange={event=>{analyzeGeneration.current++;setBusy(false);history.change({face,headroom:Number(event.target.value),crops:{}},"headroom");}}/>
  </label>}
  <div className="panel-section">
   <p aria-live="polite">{notice}</p>
   <p><small>Face alignment is a framing aid, not certification of government-ID requirements. Automatic detection depends on native browser support. Choose a background after using Background Editor to make the source transparent. Solid background colors do not remove an opaque original backdrop.</small></p>
   <label>Replacement backdrop for transparent image areas
    <select value={background} onChange={event=>setBackground(event.target.value)}>
     <option value="transparent">Keep transparency</option>
     <option value="#ffffff">White</option>
     <option value="#0066cc">Blue</option>
     <option value="#eeeeee">Light grey</option>
    </select>
   </label>
   <div className="two-inputs">
    <label>Custom ID width (mm)
     <input type="number" min="10" max="200" step="0.1" value={customWidth}
       onChange={event=>setCustomWidth(event.target.value)}/>
    </label>
    <label>Custom ID height (mm)
     <input type="number" min="10" max="200" step="0.1" value={customHeight}
       onChange={event=>setCustomHeight(event.target.value)}/>
    </label>
   </div>
   {!custom&&<p role="alert">Set both dimensions between 10 and 200 mm before creating or previewing a custom size.</p>}
   <div className="three-inputs">
    {sizes.map(size=><label key={size.id}>
     <input type="checkbox" checked={selected.includes(size.id)}
      onChange={event=>setSelected(old=>event.target.checked?[...old,size.id]:old.filter(id=>id!==size.id))}/>
     {size.label}
     <button type="button" className="icon-button" aria-label={"Preview "+size.label}
      onClick={()=>{pointers.current.clear();setActive(size.id);}}>View</button>
    </label>)}
    {!custom&&<label>
      <input type="checkbox" checked={selected.includes("id-custom")}
       onChange={event=>setSelected(old=>event.target.checked?[...old,"id-custom"]:old.filter(id=>id!=="id-custom"))}/>
      Custom size (enter valid dimensions above)
    </label>}
   </div>
   <label>Copies per new ID design
    <input type="number" min={1} max={1000} step={1} value={copies}
     onChange={event=>{const n=Number(event.target.value);if(Number.isSafeInteger(n)&&n>=1&&n<=1000)setCopies(n);}}/>
   </label>

  </div>
 </EditorWorkspace>;
}
