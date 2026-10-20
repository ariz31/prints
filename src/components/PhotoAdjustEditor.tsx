import {useState} from "react";
import type {CSSProperties} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {
  DEFAULT_ADJUSTMENTS,photoFilterCss,validPhotoAdjustments,
} from "../core/photoAdjustments.ts";
import type {PhotoAdjustments} from "../core/photoAdjustments.ts";

interface Props {
  item:PhotoAsset;
  onApply:(adjustments:PhotoAdjustments|undefined)=>void;
  onCancel:()=>void;
}
type AdjustmentKey=keyof PhotoAdjustments;
const CONTROLS:{key:AdjustmentKey;label:string;min:number;max:number}[]=[
  {key:"brightness",label:"Brightness",min:-100,max:100},
  {key:"contrast",label:"Contrast",min:-100,max:100},
  {key:"saturation",label:"Saturation",min:-100,max:200},
];

/**
 * A standalone, nondestructive editor. Adjustments apply to the entire
 * source (or processed background) and the same filter is later used by
 * the print rasterizer. No changes reach the project until Apply.
 */
export default function PhotoAdjustEditor({item,onApply,onCancel}:Props){
  const [draft,setDraft]=useState<PhotoAdjustments>(
    ()=>item.adjustments?{...item.adjustments}:{...DEFAULT_ADJUSTMENTS});
  const [compareOriginal,setCompareOriginal]=useState(false);
  const [scope,setScope]=useState<"full"|"crop">("full");
  const [loadError,setLoadError]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const src=item.processedUrl??item.url;
  const isNeutral=CONTROLS.every(c=>draft[c.key]===0);
  const changed=CONTROLS.some(c=>draft[c.key]!==(
    item.adjustments?.[c.key]??0));
  const filter=compareOriginal?"none":photoFilterCss(draft);
  const crop=item.crop;
  const croppedStyle={
    width:(100/crop.width)+"%",height:(100/crop.height)+"%",
    left:(-100*crop.x/crop.width)+"%",top:(-100*crop.y/crop.height)+"%",
    filter,
  };

  function setValue(key:AdjustmentKey,value:number){
    const candidate={...draft,[key]:value};
    if(validPhotoAdjustments(candidate)){
      setDraft(candidate);
      setCompareOriginal(false);
    }
  }
  function apply(){
    onApply(isNeutral?undefined:{...draft});
  }

  return <main className="photo-adjust-route" aria-label="Photo adjustments editor">
    <header className="photo-adjust-header">
      <button className="secondary-button" onClick={onCancel}
        aria-label="Cancel photo adjustments and return to workspace">← Back</button>
      <div className="photo-adjust-title">
        <h1>Edit photo</h1>
        <p title={item.name}>{item.name}</p>
      </div>
      <button className="primary-button" onClick={apply}
        disabled={!changed||compareOriginal}>Apply changes</button>
    </header>
    <div className="photo-adjust-layout">
      <section className="photo-adjust-preview" aria-label="Entire photo editing preview">
        <div className="photo-adjust-preview-top">
          <div className="photo-adjust-view-switch" role="group" aria-label="Preview area">
            <button className={scope==="full"?"active":""}
              aria-pressed={scope==="full"} onClick={()=>setScope("full")}>
              Entire photo</button>
            <button className={scope==="crop"?"active":""}
              aria-pressed={scope==="crop"} onClick={()=>setScope("crop")}>
              Print crop</button>
          </div>
          <button className="secondary-button" aria-pressed={compareOriginal}
            onClick={()=>setCompareOriginal(v=>!v)}>
            {compareOriginal?"Viewing original":"Compare original"}
          </button>
        </div>
        <div className="photo-adjust-preview-stage">
          {loadError
            ? <p role="alert" className="warning">This photo could not be displayed. Return to Images and reload its source.</p>
            : <>
                {scope==="full"?
                  <img className="photo-adjust-full-image" src={src}
                    alt={"Entire source photo: "+item.name}
                    style={{filter}}
                    onLoad={()=>setLoaded(true)}
                    onError={()=>setLoadError(true)}/>
                : <div className="photo-adjust-print-frame"
                    style={{aspectRatio:String(item.widthMm/item.heightMm),
                      "--photo-crop-ratio":item.widthMm/item.heightMm} as CSSProperties}>
                    <img src={src} alt={"Print crop preview: "+item.name}
                      style={croppedStyle}
                      onLoad={()=>setLoaded(true)}
                      onError={()=>setLoadError(true)}/>
                  </div>}
              </>}
        </div>
        <div className="photo-adjust-preview-foot">
          <span>{scope==="full"?"Full photo · no cropping":"Exact print framing"}</span>
          <span>{compareOriginal?"Original, unadjusted":isNeutral?"Unadjusted": "Live adjustments"}
            {!loaded&&!loadError?" · Loading…":""}</span>
        </div>
      </section>
      <section className="photo-adjust-controls" aria-label="Photo tone controls">
        <h2>Adjustments</h2>
        <p>Changes are preview-only until you apply them. Original image pixels are preserved.</p>
        {CONTROLS.map(({key,label,min,max})=>
          <div className="photo-adjust-control" key={key}>
            <div className="photo-adjust-control-heading">
              <label htmlFor={"photo-adjust-"+key}>{label}</label>
              <output htmlFor={"photo-adjust-"+key}>{draft[key]>0?"+":""}{draft[key]}</output>
            </div>
            <input id={"photo-adjust-"+key} type="range" min={min} max={max}
              step={1} value={draft[key]} onChange={e=>setValue(key,Number(e.target.value))}/>
            <div className="photo-adjust-ticks"><span>{min}</span><span>0</span><span>+{max}</span></div>
          </div>
        )}
        <div className="photo-adjust-actions">
          <button className="secondary-button"
            onClick={()=>{setDraft({...DEFAULT_ADJUSTMENTS});setCompareOriginal(false);}}
            disabled={isNeutral}>Reset adjustments</button>
          <button className="primary-button" onClick={apply}
            disabled={!changed||compareOriginal}>Apply changes</button>
        </div>
        <p className="hint">The same brightness, contrast, and saturation settings are used in the editor, print-sheet preview, PNG, and PDF output.</p>
      </section>
    </div>
  </main>;
}
