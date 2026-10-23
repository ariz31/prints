import {useState} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {fitCropToAspect} from "../core/crop.ts";
import type {CropRegion} from "../core/crop.ts";
import {frameIdFace,ID_SIZES} from "../core/idPhoto.ts";
import type {FaceBounds,IdSize} from "../core/idPhoto.ts";

interface Props {
 item:PhotoAsset;
 onCreate:(variants:{size:IdSize;crop:CropRegion}[],quantity:number)=>void;
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
async function detectLocalFace(url:string):Promise<{face:FaceBounds;count:number}>{
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
 return {face:faces[0].boundingBox,count:faces.length};
}
export default function IdPhotoStudio({item,onCreate,onOpenCrop,onOpenBackground,onClose}:Props){
 const [selected,setSelected]=useState<string[]>(["id-1x1","id-2x2"]);
 const [active,setActive]=useState("id-2x2");
 const [face,setFace]=useState<FaceBounds|null>(null);
 const [headroom,setHeadroom]=useState(13);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("The exact visible crop is used for every generated ID size.");
 const [copies,setCopies]=useState(4);
 const iw=item.processedWidth??item.pixelWidth,ih=item.processedHeight??item.pixelHeight;
 const activeSize=ID_SIZES.find(s=>s.id===active)??ID_SIZES[0];
 const cropFor=(size:IdSize):CropRegion=>face
  ?frameIdFace(face,iw,ih,size.widthMm,size.heightMm,headroom/100)
  :fitCropToAspect(item.crop,iw,ih,size.widthMm,size.heightMm);
 const crop=cropFor(activeSize);
 async function autoAlign(){
  setBusy(true);
  try {
   const result=await detectLocalFace(item.processedUrl??item.url);
   frameIdFace(result.face,iw,ih,activeSize.widthMm,activeSize.heightMm,headroom/100);
   setFace(result.face);
   setNotice(result.count>1
    ?"Multiple faces detected; the largest was selected. Review or use manual Crop."
    :"Face framed locally. Review headroom and inspect each size before printing.");
  }catch(error){setNotice(error instanceof Error?error.message:"Face detection failed.");}
  finally{setBusy(false);}
 }
 return <main className="crop-editor" aria-label="Smart ID Photo Studio">
  <div className="crop-toolbar">
   <div><h2>Smart ID photos</h2><p>Create multiple physical sizes from one original.</p></div>
   <button className="icon-button crop-close" onClick={onClose} aria-label="Close ID studio">×</button>
  </div>
  <div className="crop-view" aria-label={"Exact "+activeSize.label+" ID crop preview"}
   role="img" style={{aspectRatio:String(activeSize.widthMm/activeSize.heightMm),maxHeight:"48vh"}}>
   <img src={item.processedUrl??item.url} alt={item.name} draggable={false}
    style={{width:(100/crop.width)+"%",height:(100/crop.height)+"%",
     left:(-100*crop.x/crop.width)+"%",top:(-100*crop.y/crop.height)+"%"}}/>
   <div className="crop-grid" aria-hidden="true"/>
  </div>
  <div className="crop-actions" style={{flexWrap:"wrap"}}>
   <button className="secondary-button" disabled={busy} onClick={()=>void autoAlign()}>
    {busy?"Checking locally…":"Auto-align face (when supported)"}</button>
   <button className="secondary-button" onClick={onOpenCrop}>Manual crop</button>
   <button className="secondary-button" onClick={onOpenBackground}>Background editor</button>
   {face&&<button className="secondary-button" onClick={()=>{setFace(null);setNotice("Manual crop restored.");}}>Reset face alignment</button>}
  </div>
  {face&&<label className="crop-zoom">Headroom {headroom}%
   <input type="range" min="0" max="35" value={headroom}
    onChange={event=>setHeadroom(Number(event.target.value))}/>
  </label>}
  <div className="panel-section">
   <p aria-live="polite">{notice}</p>
   <p><small>Face alignment is only a framing aid, not certification of passport or government ID requirements. Automatic detection depends on native browser support. Background editing remains manual until on-device segmentation is added.</small></p>
   <div className="three-inputs">
    {ID_SIZES.map(size=><label key={size.id}>
     <input type="checkbox" checked={selected.includes(size.id)}
      onChange={event=>setSelected(old=>event.target.checked?[...old,size.id]:old.filter(id=>id!==size.id))}/>
     {size.label}
     <button type="button" className="icon-button" aria-label={"Preview "+size.label}
      onClick={()=>setActive(size.id)}>View</button>
    </label>)}
   </div>
   <label>Copies per new ID design
    <input type="number" min={1} max={1000} step={1} value={copies}
     onChange={event=>{const n=Number(event.target.value);if(Number.isSafeInteger(n)&&n>=1&&n<=1000)setCopies(n);}}/>
   </label>
   <div className="crop-actions">
    <button className="secondary-button" onClick={onClose}>Cancel</button>
    <button className="primary-button" disabled={!selected.length}
      onClick={()=>onCreate(ID_SIZES.filter(s=>selected.includes(s.id)).map(size=>({size,crop:cropFor(size)})),copies)}>
      Create {selected.length} ID designs</button>
   </div>
  </div>
 </main>;
}
