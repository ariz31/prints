import {useEffect,useRef,useState} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import type {PreflightReport} from "../core/printPreflight.ts";
import StudioIcon from "./StudioIcon.tsx";
interface Props{
 initialFormat?:"pdf"|"png"|"zip";initialId?:string;
 assets:PhotoAsset[];dpi:300|600;pages:string;pageCount:number;pageError?:string;preflight:PreflightReport;
 busy:boolean;progress:{completed:number;total:number}|null;error:string;notice:string;
 onDpi:(dpi:300|600)=>void;onPages:(value:string)=>void;onClose:()=>void;onCancel:()=>void;
 onPdf:()=>void;onPng:(asset:PhotoAsset)=>void;onZip:()=>void;
}
export default function ExportDialog({initialFormat="pdf",initialId,assets,dpi,pages,pageCount,pageError,preflight,busy,progress,error,notice,
 onDpi,onPages,onClose,onCancel,onPdf,onPng,onZip}:Props){
 const dialog=useRef<HTMLDialogElement>(null);
 const [format,setFormat]=useState(initialFormat),[id,setId]=useState(initialId??assets[0]?.id??"");
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 const target=assets.find(a=>a.id===id)??assets[0];
 const invalid=format==="pdf"?(!!pageError||pageCount===0||preflight.errors.length>0):!target;
 return <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title"
  onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <div className="export-dialog-header"><div><h2 id="export-title">Export & print</h2><p className="hint">Exact dimensions. Processed on your device.</p></div>
   <button className="icon-button" disabled={busy} aria-label="Close export settings" onClick={onClose}><StudioIcon name="close" size={19}/></button></div>
  <fieldset className="export-settings" disabled={busy}>
   <label>Format<select value={format} onChange={e=>setFormat(e.target.value as "pdf"|"png"|"zip")}>
    <option value="pdf">PDF · print sheets</option><option value="png">PNG · one finished design</option><option value="zip">ZIP · all finished designs</option>
   </select></label>
   <label>Output quality<select value={dpi} onChange={e=>onDpi(Number(e.target.value) as 300|600)}>
    <option value={300}>300 DPI · standard</option><option value={600}>600 DPI · high detail</option>
   </select></label>
   {format==="pdf"?<label>Export pages<input value={pages} maxLength={80} aria-invalid={!!pageError} onChange={e=>onPages(e.target.value)} placeholder="all or 1-3,5"/></label>:
    format==="png"?<label>Design<select value={target?.id??""} onChange={e=>setId(e.target.value)}>{assets.map(a=><option key={a.id} value={a.id}>{a.name} · {a.widthMm} × {a.heightMm} mm</option>)}</select></label>:
    <p className="hint">{assets.length} independent designs. Copy quantities are applied to PDF sheets.</p>}
  </fieldset>
  <section className="export-preflight" aria-label="Export preflight">
   <h3>{preflight.errors.length?"Resolve print errors":preflight.warnings.length?"Review resolution warnings":"Print check passed"}</h3>
   {pageError&&<p className="warning" role="alert">{pageError}</p>}
   {[...preflight.errors,...preflight.warnings].map((issue,i)=><p key={i} className="hint"><strong>{issue.title}</strong> {issue.detail}</p>)}
   <p className="hint">{format==="pdf"?pageCount+" sheets":format==="zip"?assets.length+" PNG files":target?target.widthMm+" × "+target.heightMm+" mm":"Choose a design"} · {dpi} DPI. Source resolution limits real detail.</p>
  </section>
  {error&&<p className="banner danger" role="alert">{error}</p>}
  {notice&&<p className="banner success" role="status">{notice}</p>}
  {busy&&<div className="export-progress" role="status"><progress aria-label="Export progress" value={progress?.completed??0} max={Math.max(1,progress?.total??1)}/>
   <span>Preparing {progress?Math.round(progress.completed/Math.max(1,progress.total)*100):0}%</span></div>}
  <p className="hint">Print PDFs at <strong>100% / Actual Size</strong>. Screen color depends on your display; verify paper and printer settings.</p>
  <div className="export-dialog-actions">{busy?<button className="secondary-button" onClick={onCancel}>Cancel export</button>:
   <button className="primary-button" disabled={invalid||!assets.length} onClick={()=>format==="pdf"?onPdf():format==="png"&&target?onPng(target):onZip()}>
    <StudioIcon name="download" size={17}/>Export {format.toUpperCase()}</button>}</div>
 </dialog>;
}
