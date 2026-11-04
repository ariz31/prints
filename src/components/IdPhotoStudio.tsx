import StudioSelect from "./StudioSelect.tsx";
import {useEffect,useRef,useState} from "react";
import type {CSSProperties,KeyboardEvent,PointerEvent} from "react";
import EditorWorkspace from "./EditorWorkspace.tsx";
import PhotoAdjustmentRow from "./PhotoAdjustmentRow.tsx";
import {useCropRaster} from "./useCropRaster.ts";
import {useEditorHistory} from "./useEditorHistory.ts";
import {gestureCrop} from "../core/cropGesture.ts";
import {DEFAULT_ADJUSTMENTS} from "../core/photoAdjustments.ts";
import {liveCropImageStyle} from "../core/liveCropPreview.ts";
import {zoomCrop,panCrop,FULL_CROP} from "../core/crop.ts";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {fitCropToAspect} from "../core/crop.ts";
import type {CropRegion} from "../core/crop.ts";
import {frameIdFace,ID_SIZES,customIdSize,canEditIdFraming} from "../core/idPhoto.ts";
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
 const stageRef=useRef<HTMLDivElement>(null);
 const liveImageRef=useRef<HTMLImageElement>(null);
 const gestureCropRef=useRef<CropRegion|null>(null);
 const gestureBounds=useRef<DOMRect|null>(null);
 const gestureFrame=useRef<number|null>(null);
 const [dragging,setDragging]=useState(false);
 const [panel,setPanel]=useState<"frame"|"sizes"|"background"|"output">("frame");
 const [retry,setRetry]=useState(0);
 const [compare,setCompare]=useState(false);
 const [faces,setFaces]=useState<FaceBounds[]>([]);
 const [faceIndex,setFaceIndex]=useState(0);

 const [busy,setBusy]=useState(false);
 const [loadedSource,setLoadedSource]=useState("");
 const [failedSource,setFailedSource]=useState("");
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
 const source=item.processedUrl??item.url;
 const sourceKey=JSON.stringify([item.url,item.processedUrl??null]);
 const sourceReady=loadedSource===sourceKey&&failedSource!==sourceKey;
 // Exact rasterization is paused during direct manipulation: the already
 // loaded source image paints instantly and the precise preview catches up.
 const raster=useCropRaster({...item,widthMm:activeSize.widthMm,heightMm:activeSize.heightMm,crop,
  adjustments:background==="transparent"?item.adjustments:{...DEFAULT_ADJUSTMENTS,...item.adjustments,backgroundColor:background}},
  sourceReady&&!dragging,retry);
 const base=fitCropToAspect(FULL_CROP,iw,ih,activeSize.widthMm,activeSize.heightMm);
 const zoom=base.width/crop.width;
 const framingEnabled=canEditIdFraming(sourceReady,compare,busy);
 const cropRef=useRef(crop);cropRef.current=crop;
 function paintLiveCrop(next:CropRegion){
  const image=liveImageRef.current;
  if(!image)return;
  const style=liveCropImageStyle(next,item.adjustments);
  image.style.width=style.width;image.style.height=style.height;
  image.style.left=style.left;image.style.top=style.top;
 }
 function cancelGesture(){
  if(gestureFrame.current!==null){cancelAnimationFrame(gestureFrame.current);gestureFrame.current=null;}
  pointers.current.clear();gestureBounds.current=null;gestureCropRef.current=null;
  paintLiveCrop(cropRef.current);setDragging(false);
 }
 function changeCrop(next:CropRegion){
  cancelGesture();cropRef.current=next;
  analyzeGeneration.current++;setBusy(false);
  history.change({...history.value,crops:{...history.value.crops,[activeSize.id]:next}},"crop-"+active);
 }
 function pointerDown(event:PointerEvent<HTMLDivElement>){
  if(!framingEnabled||pointers.current.size>=2||(event.pointerType==="mouse"&&event.button!==0))return;
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch{return;}
  if(!pointers.current.size){
   gestureCropRef.current=cropRef.current;
   gestureBounds.current=event.currentTarget.getBoundingClientRect();
   setDragging(true);
  }
  pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
 }
 function pointerMove(event:PointerEvent<HTMLDivElement>){
  if(!framingEnabled||!pointers.current.has(event.pointerId)||!gestureBounds.current)return;
  const before=[...pointers.current.values()];
  pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  gestureCropRef.current=gestureCrop(
   gestureCropRef.current??cropRef.current,before,[...pointers.current.values()],gestureBounds.current);
  // Pointer events never publish React state or queue new raster jobs.
  if(gestureFrame.current===null)gestureFrame.current=requestAnimationFrame(()=>{
   gestureFrame.current=null;
   if(gestureCropRef.current)paintLiveCrop(gestureCropRef.current);
  });
 }
 function pointerEnd(event:PointerEvent<HTMLDivElement>){
  if(!pointers.current.has(event.pointerId))return;
  pointers.current.delete(event.pointerId);
  if(pointers.current.size)return;
  const next=gestureCropRef.current;
  cancelGesture();
  if(!next)return;
  const prev=cropRef.current;
  if(Math.abs(next.x-prev.x)<1e-8&&Math.abs(next.y-prev.y)<1e-8&&
   Math.abs(next.width-prev.width)<1e-8&&Math.abs(next.height-prev.height)<1e-8)return;
  paintLiveCrop(next);cropRef.current=next;
  analyzeGeneration.current++;setBusy(false);
  history.set({...history.value,crops:{...history.value.crops,[activeSize.id]:next}});
 }
 function keyFraming(event:KeyboardEvent<HTMLDivElement>){
  if(!framingEnabled||event.target!==event.currentTarget)return;
  const moves:Record<string,[number,number]>={
   ArrowUp:[0,-.015],ArrowDown:[0,.015],ArrowLeft:[-.015,0],ArrowRight:[.015,0],
  };
  const move=moves[event.key];
  if(move){event.preventDefault();changeCrop(panCrop(cropRef.current,move[0],move[1]));}
  else if(event.key==="+"||event.key==="="){
   event.preventDefault();changeCrop(zoomCrop(cropRef.current,1.12));
  }else if(event.key==="-"){
   event.preventDefault();changeCrop(zoomCrop(cropRef.current,1/1.12));
  }
 }
 useEffect(()=>{
  const el=stageRef.current;
  if(!el||!framingEnabled)return;
  const wheel=(event:WheelEvent)=>{
   if(event.ctrlKey||event.metaKey||!Number.isFinite(event.deltaY))return;
   event.preventDefault();
   const bounds=el.getBoundingClientRect();
   if(!bounds.width||!bounds.height)return;
   const factor=Math.exp(Math.max(-1,Math.min(1,-event.deltaY/460)));
   const next=zoomCrop(cropRef.current,factor,
    (event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height);
   cropRef.current=next;
   history.change({...history.value,crops:{...history.value.crops,[activeSize.id]:next}},"id-wheel-"+active);
  };
  el.addEventListener("wheel",wheel,{passive:false});
  return()=>el.removeEventListener("wheel",wheel);
 },[framingEnabled,active,sourceKey]);
 useEffect(()=>()=>{if(gestureFrame.current!==null)cancelAnimationFrame(gestureFrame.current);},[]);
 useEffect(()=>{cancelGesture();},[sourceKey]);
 async function autoAlign(){
  cancelGesture();
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
 const stage=<div ref={stageRef} className="crop-view id-crop-view" aria-label={"Exact "+activeSize.label+" ID crop preview"}
   role="group" tabIndex={0} style={{aspectRatio:String(activeSize.widthMm/activeSize.heightMm),
    "--crop-ratio":activeSize.widthMm/activeSize.heightMm,
    backgroundColor:background==="transparent"?undefined:background} as CSSProperties}
   onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd}
   onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={keyFraming}>
   {/* Paint the exact framing immediately using the decoded local source.
       The output raster replaces it only after successful decoding. */}
   <img ref={liveImageRef} key={sourceKey+":"+retry} src={source} alt={item.name} draggable={false}
     onLoad={()=>{setLoadedSource(sourceKey);setFailedSource("");}}
     onError={()=>{setLoadedSource("");setFailedSource(sourceKey);}}
     style={{...liveCropImageStyle(crop,item.adjustments),
      visibility:compare||raster.ready?"hidden":undefined}}/>
   {raster.url&&<img key={raster.url} src={raster.url} alt="Exact computed ID crop" draggable={false}
     onLoad={event=>raster.loaded(event.currentTarget.src)}
     onError={raster.failed}
     style={{inset:0,width:"100%",height:"100%",
      visibility:compare||!raster.ready?"hidden":undefined}}/>}
   {compare&&<img src={item.url} alt="Original photo for comparison" draggable={false}
     onError={()=>{setCompare(false);setNotice("Original photo unavailable for comparison. Your edited crop remains unchanged.");}}
     style={{inset:0,width:"100%",height:"100%",objectFit:"contain"}}/>}
   {!sourceReady&&!compare&&failedSource!==sourceKey&&<span className="crop-loading" role="status">Loading photo…</span>}
   {!compare&&<><div className="crop-grid" aria-hidden="true"/><div className="id-head-guide" aria-hidden="true"/></>}
  </div>;
 return <EditorWorkspace title="Smart ID photos" name={item.name} className="id-workspace" onCancel={onClose}
  onApply={()=>onCreate(sizes.filter(s=>selected.includes(s.id)).map(size=>({size,crop:cropFor(size)})),copies,background==="transparent"?undefined:background)}
  applyLabel={"Create "+selected.length+" designs"} disabled={!validSelection||!sourceReady||!raster.ready||compare||busy}
  undo={()=>{if(!framingEnabled)return;cancelGesture();analyzeGeneration.current++;setBusy(false);history.undo();}}
  redo={()=>{if(!framingEnabled)return;cancelGesture();analyzeGeneration.current++;setBusy(false);history.redo();}}
  canUndo={history.canUndo&&framingEnabled} canRedo={history.canRedo&&framingEnabled} stage={stage}
  tools={<div className="id-preview-toolbar">
    <span className="id-preview-dimensions"><strong>{activeSize.label}</strong><small>{activeSize.widthMm} × {activeSize.heightMm} mm</small></span>
    <div className="id-preview-formats" role="group" aria-label="Choose preview ID size">
     {sizes.map(size=><button type="button" key={size.id} className="id-preview-format"
      aria-pressed={activeSize.id===size.id} title={"Preview "+size.label}
      onClick={()=>{cancelGesture();setActive(size.id);}}>
      {size.id==="id-custom"?"Custom":size.label}
     </button>)}
    </div>
    <button className="secondary-button id-preview-compare" type="button" aria-pressed={compare}
     onClick={()=>{cancelGesture();setCompare(value=>!value);}}>
     {compare?"Show edited":"Compare"}
    </button>
   </div>}>
  {failedSource===sourceKey&&<p className="banner danger" role="alert">The local source photo could not be loaded.
   <button className="secondary-button" onClick={()=>{cancelGesture();setFailedSource("");setLoadedSource("");setRetry(v=>v+1);}}>Retry source</button></p>}
  {raster.error&&<p className="banner danger" role="alert">{raster.error}
   <button className="secondary-button" onClick={()=>setRetry(v=>v+1)}>Retry preview</button></p>}
  <div className="id-studio-inspector-heading">
   <h2>ID Photo Studio</h2><span>On-device editing</span>
  </div>
  <div className="id-studio-tabs" role="group" aria-label="ID Photo Studio sections">
   {([
    ["frame","Framing"],["sizes","Sizes"],["background","Background"],["output","Output"]
   ] as const).map(([id,label])=><button type="button" key={id}
    aria-pressed={panel===id} onClick={()=>{cancelGesture();setPanel(id);}}>
    {label}
   </button>)}
  </div>
  <p className="id-studio-status" role="status">{notice}</p>
  {panel==="frame"&&<section className="id-studio-section" aria-label="Portrait framing controls">
   <div className="id-studio-section-title"><h3>Portrait framing</h3><span>{Math.round(zoom*100)}% zoom</span></div>
   <p className="hint">Drag to reposition, pinch or scroll to zoom. Use arrow keys for precise placement.</p>
   <PhotoAdjustmentRow id="id-portrait-zoom" label="Zoom" unit="%"
    ariaLabel="ID portrait zoom" min={100} max={800} resetValue={100}
    value={Math.max(100,Math.min(800,Math.round(zoom*100)))}
    disabled={!framingEnabled}
    onChange={percent=>{if(framingEnabled)changeCrop(zoomCrop(crop,(percent/100)/zoom));}}/>
   <div className="id-studio-action-row">
    <button className="secondary-button" type="button" disabled={!framingEnabled}
     onClick={()=>changeCrop(base)}>Fit portrait</button>
    <button className="secondary-button" type="button" onClick={()=>{cancelGesture();onOpenCrop();}}>
     Manual crop</button>
   </div>
   <div className="id-studio-divider"/>
   <div className="id-studio-section-title"><h3>Face alignment</h3><span>Optional</span></div>
   <button className="secondary-button id-studio-wide-action" type="button" disabled={!framingEnabled}
    onClick={()=>void autoAlign()}>{busy?"Checking locally…":"Auto-align face"}</button>
   {faces.length>1&&<label>Portrait subject
    <StudioSelect value={faceIndex} disabled={!framingEnabled} onChange={event=>{
     const index=Number(event.target.value);
     if(Number.isInteger(index)&&faces[index]){
      cancelGesture();setFaceIndex(index);history.set({face:faces[index],headroom,crops:{}});
     }
    }}>
     {faces.map((_,index)=><option key={index} value={index}>Face {index+1}</option>)}
    </StudioSelect>
   </label>}
   {face&&<PhotoAdjustmentRow id="id-headroom" label="Headroom" unit="%"
    min={0} max={35} value={headroom} resetValue={13} disabled={!framingEnabled}
    onChange={value=>{if(!framingEnabled)return;cancelGesture();analyzeGeneration.current++;setBusy(false);
     history.change({face,headroom:value,crops:{}},"headroom");}}/>}
   {face&&<button className="secondary-button id-studio-wide-action" type="button" disabled={!framingEnabled}
    onClick={()=>{cancelGesture();history.set({face:null,headroom:13,crops:{}});setFaces([]);setNotice("Manual framing restored.");}}>
    Reset face alignment</button>}
   <p className="hint">Alignment is a framing aid, not certification of government-ID requirements. Automatic detection depends on browser support.</p>
  </section>}
  {panel==="sizes"&&<section className="id-studio-section" aria-label="ID photo size controls">
   <div className="id-studio-section-title"><h3>ID sizes</h3><span>{selected.length} selected</span></div>
   <p className="hint">Choose sizes to create. Preview sets the frame shown on the left without changing your selection.</p>
   <div className="id-studio-size-list">
    {sizes.map(size=><div key={size.id} className={"id-studio-size-item"+(activeSize.id===size.id?" is-active":"")}>
     <label><input type="checkbox" checked={selected.includes(size.id)}
      onChange={event=>setSelected(old=>event.target.checked?[...old,size.id]:old.filter(id=>id!==size.id))}/>
      <span><strong>{size.label}</strong><small>{size.widthMm} × {size.heightMm} mm</small></span>
     </label>
     <button className="secondary-button" type="button" aria-label={"Preview "+size.label}
      aria-pressed={activeSize.id===size.id}
      onClick={()=>{cancelGesture();setActive(size.id);}}>Preview</button>
    </div>)}
    {!custom&&<label className="id-studio-invalid-custom">
     <input type="checkbox" checked={selected.includes("id-custom")}
      onChange={event=>setSelected(old=>event.target.checked?[...old,"id-custom"]:old.filter(id=>id!=="id-custom"))}/>
     Custom size (complete the dimensions below)
    </label>}
   </div>
   <div className="id-studio-divider"/>
   <div className="id-studio-section-title"><h3>Custom dimensions</h3><span>Millimeters</span></div>
   <div className="id-studio-dimension-fields">
    <label>Width (mm)
     <input type="number" min="10" max="200" step="0.1" value={customWidth}
      onChange={event=>setCustomWidth(event.target.value)}/>
    </label>
    <label>Height (mm)
     <input type="number" min="10" max="200" step="0.1" value={customHeight}
      onChange={event=>setCustomHeight(event.target.value)}/>
    </label>
   </div>
   {!custom&&<p className="hint" role="alert">Enter valid dimensions from 10 to 200 mm to preview the custom size.</p>}
  </section>}
  {panel==="background"&&<section className="id-studio-section" aria-label="ID background controls">
   <div className="id-studio-section-title"><h3>Background</h3><span>Photo-specific</span></div>
   <p className="hint">Choose a fill for transparent areas, or clean up the original background in the dedicated editor.</p>
   <label>Replacement backdrop
    <StudioSelect value={background} onChange={event=>setBackground(event.target.value)}>
     <option value="transparent">Keep transparency</option>
     <option value="#ffffff">White</option>
     <option value="#0066cc">Blue</option>
     <option value="#eeeeee">Light grey</option>
    </StudioSelect>
   </label>
   <button className="secondary-button id-studio-wide-action" type="button"
    onClick={()=>{cancelGesture();onOpenBackground();}}>Open background editor</button>
   <p className="hint">A solid fill does not remove an opaque background; use the Background Editor first.</p>
  </section>}
  {panel==="output"&&<section className="id-studio-section" aria-label="ID creation options">
   <div className="id-studio-section-title"><h3>Create designs</h3><span>{selected.length} formats</span></div>
   <p className="hint">Each checked ID size creates a new design with its own exact crop. All rendering remains on this device.</p>
   <label>Copies per new ID design
    <input type="number" min={1} max={1000} step={1} value={copies}
     onChange={event=>{const n=Number(event.target.value);if(Number.isSafeInteger(n)&&n>=1&&n<=1000)setCopies(n);}}/>
   </label>
   <div className="id-studio-output-summary">
    <span>Selected formats</span>
    <strong>{selected.length}</strong>
    <span>Copies per design</span>
    <strong>{copies}</strong>
    <span>Active preview</span>
    <strong>{activeSize.label}</strong>
   </div>
   <p className="hint">Review each crop and your physical ID-photo requirements before printing. The exact generated raster is required before creating designs.</p>
  </section>}
 </EditorWorkspace>;
}
