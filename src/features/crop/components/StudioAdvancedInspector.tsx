import type {CropStudioDocument} from "../logic/studioDocument.ts";
import type {ShapePoint} from "../../../domain/models/crop.ts";
import {validPerspectiveQuad} from "../logic/studioGeometry.ts";
import {FRAME_PRESETS} from "../../frames/logic/frames.ts";
import BoundedNumberField from "../../../shared/components/BoundedNumberField.tsx";
import StudioSelect from "../../../shared/components/StudioSelect.tsx";

interface Props{
 studio:CropStudioDocument;
 interactive:boolean;
 onImage:(patch:Partial<CropStudioDocument["imageTransform"]>)=>void;
 onCrop:(patch:Partial<CropStudioDocument["cropTransform"]>)=>void;
 onFrame:(patch:Partial<CropStudioDocument["frame"]>)=>void;
 onSelectTool:(tool:"crop"|"shape"|"frame"|"perspective")=>void;
}
const corners=["Top-left","Top-right","Bottom-right","Bottom-left"];
const unit:[ShapePoint,ShapePoint,ShapePoint,ShapePoint]=[
 {x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1},
];
export default function StudioAdvancedInspector({
 studio,interactive,onImage,onCrop,onFrame,onSelectTool,
}:Props){
 const image=studio.imageTransform,crop=studio.cropTransform,f=studio.frame;
 const updateCorner=(index:number,coord:"x"|"y",value:number)=>{
   const previous=image.perspective??unit;
   const next=previous.map((p,i)=>i===index?{...p,[coord]:value/100}:{...p}) as [ShapePoint,ShapePoint,ShapePoint,ShapePoint];
   if(validPerspectiveQuad(next))onImage({perspective:next});
 };
 const setFrameBounds=(key:"x"|"y"|"width"|"height",val:number)=>{
   const b=f.bounds;
   const copy={...b,[key]:val/100};
   // Geometry validation stays in parent and rejects out-of-bounds changes.
   onFrame({bounds:copy});
 };
 return <>
   <details className="crop-studio-panel"><summary>Perspective &amp; independent transforms</summary>
     <p className="hint">Use separate image and crop transformations. Existing photo adjustments remain separate and are not duplicated in the v2 document.</p>
     <div className="two-inputs">
       <BoundedNumberField label="Image rotation (°)" value={image.rotationDeg}
         min={-180} max={180} step={.1}
         onCommit={rotationDeg=>onImage({rotationDeg})}/>
       <BoundedNumberField label="Crop rotation (°)" value={crop.rotationDeg}
         min={-180} max={180} step={.1}
         onCommit={rotationDeg=>onCrop({rotationDeg})}/>
       <BoundedNumberField label="Horizontal skew (°)" value={image.skewXDeg}
         min={-45} max={45} step={.1}
         onCommit={skewXDeg=>onImage({skewXDeg})}/>
       <BoundedNumberField label="Vertical skew (°)" value={image.skewYDeg}
         min={-45} max={45} step={.1}
         onCommit={skewYDeg=>onImage({skewYDeg})}/>
     </div>
     <div className="crop-actions">
       <label className="check-row"><input type="checkbox"
         checked={image.flipX} disabled={!interactive}
         onChange={e=>onImage({flipX:e.target.checked})}/>Flip image X</label>
       <label className="check-row"><input type="checkbox"
         checked={image.flipY} disabled={!interactive}
         onChange={e=>onImage({flipY:e.target.checked})}/>Flip image Y</label>
       <label className="check-row"><input type="checkbox"
         checked={crop.flipX} disabled={!interactive}
         onChange={e=>onCrop({flipX:e.target.checked})}/>Flip crop X</label>
       <label className="check-row"><input type="checkbox"
         checked={crop.flipY} disabled={!interactive}
         onChange={e=>onCrop({flipY:e.target.checked})}/>Flip crop Y</label>
     </div>
     <div className="crop-actions">
       <label className="check-row"><input type="checkbox"
         checked={!!image.perspective} disabled={!interactive}
         onChange={e=>{
           onImage({perspective:e.target.checked?unit.map(p=>({...p})) as
             [ShapePoint,ShapePoint,ShapePoint,ShapePoint]:undefined});
           if(e.target.checked)onSelectTool("perspective");
         }}/>Enable four-corner correction</label>
       <button type="button" className="secondary-button" disabled={!image.perspective}
         onClick={()=>{onImage({perspective:unit.map(p=>({...p})) as
           [ShapePoint,ShapePoint,ShapePoint,ShapePoint]});onSelectTool("perspective")}}>
         Reset corners</button>
     </div>
     {image.perspective&&<section aria-label="Perspective corner coordinates">
       <p className="hint">Drag four corners on the canvas or enter coordinates. Invalid concave, flipped or near-degenerate quads are rejected.</p>
       {image.perspective.map((p,i)=><div key={i}>
         <strong>{corners[i]}</strong>
         <div className="two-inputs">
           <BoundedNumberField label={"Corner "+(i+1)+" X (%)"}
             value={Math.round(p.x*10000)/100} min={0} max={100}
             step={.01} onCommit={v=>updateCorner(i,"x",v)}/>
           <BoundedNumberField label={"Corner "+(i+1)+" Y (%)"}
             value={Math.round(p.y*10000)/100} min={0} max={100}
             step={.01} onCommit={v=>updateCorner(i,"y",v)}/>
         </div>
       </div>)}
     </section>}
   </details>
   <details className="crop-studio-panel"><summary>Independent frame studio</summary>
     <p className="hint">Frame geometry is independent from the source crop. Choose the Frame tool to drag or resize it directly. Existing frame preset IDs remain stable.</p>
     <label className="print-field"><span className="field-label">Decorative vector preset</span>
       <StudioSelect aria-label="Independent frame preset" value={f.presetId??""}
         onChange={e=>onFrame({presetId:e.target.value||undefined})}>
         <option value="">None / custom border only</option>
         {FRAME_PRESETS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
       </StudioSelect>
     </label>
     <div className="two-inputs">
       {(["x","y","width","height"] as const).map(k=>
         <BoundedNumberField key={k} label={"Frame "+k+" (%)"}
           value={Math.round(f.bounds[k]*10000)/100}
           min={k==="x"||k==="y"?0:1} max={100} step={.01}
           onCommit={v=>setFrameBounds(k,v)}/>)}
       <BoundedNumberField label="Frame rotation (°)" value={f.rotationDeg}
         min={-180} max={180} step={.1} onCommit={rotationDeg=>onFrame({rotationDeg})}/>
       <BoundedNumberField label="Border thickness (mm)" value={f.borderThicknessMm}
         min={0} max={50} step={.1} onCommit={borderThicknessMm=>onFrame({borderThicknessMm})}/>
       <BoundedNumberField label="Corner radius (mm)" value={f.radiusMm}
         min={0} max={1000} step={.1} onCommit={radiusMm=>onFrame({radiusMm})}/>
       <BoundedNumberField label="Border opacity (%)" value={f.borderOpacity*100}
         min={0} max={100} step={1} onCommit={v=>onFrame({borderOpacity:v/100})}/>
     </div>
     <label className="print-field"><span className="field-label">Border color</span>
       <input type="color" aria-label="Frame border color" value={f.borderColor}
         onChange={e=>onFrame({borderColor:e.target.value})}/>
     </label>
     <div className="crop-actions">
       <label className="check-row"><input type="checkbox"
         checked={f.backgroundOpacity>0}
         onChange={e=>onFrame({backgroundOpacity:e.target.checked?1:0,
           backgroundColor:f.backgroundColor??"#ffffff"})}/>
         Solid background</label>
     </div>
     {f.backgroundOpacity>0&&<div className="two-inputs">
       <label className="print-field"><span className="field-label">Background color</span>
         <input type="color" aria-label="Frame background color"
           value={f.backgroundColor??"#ffffff"}
           onChange={e=>onFrame({backgroundColor:e.target.value})}/>
       </label>
       <BoundedNumberField label="Background opacity (%)"
         value={f.backgroundOpacity*100} min={0} max={100}
         step={1} onCommit={v=>onFrame({backgroundOpacity:v/100})}/>
     </div>}
     <label className="print-field"><span className="field-label">Image placement</span>
       <StudioSelect aria-label="Image Fit or Fill" value={f.fit}
         onChange={e=>onFrame({fit:e.target.value as "fit"|"fill"})}>
         <option value="fit">Fit entire image inside frame</option>
         <option value="fill">Fill frame without stretching</option>
       </StudioSelect>
     </label>
     <div className="two-inputs">
       <BoundedNumberField label="Image scale (×)" value={f.imageScale}
         min={.1} max={20} step={.01} onCommit={imageScale=>onFrame({imageScale})}/>
       <BoundedNumberField label="Image offset X (%)" value={f.imageOffsetX*100}
         min={-200} max={200} step={.1} onCommit={v=>onFrame({imageOffsetX:v/100})}/>
       <BoundedNumberField label="Image offset Y (%)" value={f.imageOffsetY*100}
         min={-200} max={200} step={.1} onCommit={v=>onFrame({imageOffsetY:v/100})}/>
       <BoundedNumberField label="Shadow opacity (%)" value={f.shadowOpacity*100}
         min={0} max={100} step={1} onCommit={v=>onFrame({shadowOpacity:v/100})}/>
       <BoundedNumberField label="Shadow blur (mm)" value={f.shadowBlurMm}
         min={0} max={100} step={.1} onCommit={shadowBlurMm=>onFrame({shadowBlurMm})}/>
       <BoundedNumberField label="Shadow offset X (mm)" value={f.shadowOffsetXMm}
         min={-100} max={100} step={.1} onCommit={shadowOffsetXMm=>onFrame({shadowOffsetXMm})}/>
       <BoundedNumberField label="Shadow offset Y (mm)" value={f.shadowOffsetYMm}
         min={-100} max={100} step={.1} onCommit={shadowOffsetYMm=>onFrame({shadowOffsetYMm})}/>
     </div>
     <label className="print-field"><span className="field-label">Shadow color</span>
       <input type="color" aria-label="Frame shadow color" value={f.shadowColor}
         onChange={e=>onFrame({shadowColor:e.target.value})}/>
     </label>
     <div className="crop-actions">
       <button type="button" className="secondary-button" onClick={()=>
         onFrame({bounds:{x:0,y:0,width:1,height:1},rotationDeg:0})}>
         Reset placement</button>
       <button type="button" className="secondary-button" onClick={()=>onSelectTool("frame")}>
         Move on canvas</button>
     </div>
   </details>
 </>;
}
