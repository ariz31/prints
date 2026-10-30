import type { PhotoAsset } from "../core/exportPdf.ts";
import {useEffect,useRef,useState} from "react";
import type { DesignLayer, FrameLayer } from "../core/layers.ts";
import { newLayer,setFramePreset,validDesignLayers,MAX_DESIGN_LAYERS } from "../core/layers.ts";
import { FRAME_PRESETS, MIN_FRAME_WEIGHT, MAX_FRAME_WEIGHT } from "../core/frames.ts";
import { BUNDLED_FONTS, bundledFontById } from "../core/bundledFonts.ts";
import { firstUnsupportedBundledCharacter } from "../core/bundledFontCoverage.ts";
import LayerCanvas from "./LayerCanvas.tsx";
import FrameSvg from "./FrameSvg.tsx";
import BoundedNumberField from "./BoundedNumberField.tsx";
import {setLayerPercent} from "../core/layerTransforms.ts";
import {encodeLocalFont,fontCssName,loadLocalFonts} from "../core/fontAssets.ts";

import EditorWorkspace from "./EditorWorkspace.tsx";
import InlineColorField from "./InlineColorField.tsx";
import StudioIcon from "./StudioIcon.tsx";
import {useEditorHistory} from "./useEditorHistory.ts";
import {alignSelection} from "../core/layerSelection.ts";
interface Props{item:PhotoAsset;previewUrl?:string;onChange:(item:PhotoAsset)=>void;onClose:()=>void}
export default function LayerPanel({item,previewUrl,onChange,onClose}:Props){
 const history=useEditorHistory<DesignLayer[]>(()=>item.layers??[]),layers=history.value;
 const live=useRef(layers);live.current=layers;
 const alive=useRef(true),revision=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;revision.current++;};},[]);
 const [selected,setSelected]=useState<string[]>(()=>layers.length?[layers[layers.length-1].id]:[]);
 const currentFrame=layers.find((l):l is FrameLayer=>l.kind==="frame");
 const [category,setCategory]=useState(FRAME_PRESETS.find(p=>p.id===currentFrame?.frameId)?.category??"Minimal");
 const [frameSearch,setFrameSearch]=useState("");
 const [layerError,setLayerError]=useState("");
 const atLimit=layers.length>=MAX_DESIGN_LAYERS;
 const chosen=layers.filter(l=>selected.includes(l.id)&&l.kind!=="frame");
 const undo=()=>{revision.current++;history.undo();},redo=()=>{revision.current++;history.redo();};
  function update(next: DesignLayer[],key?:string) {
    if(!validDesignLayers(next)){
      setLayerError("A layer would exceed the design bounds or the "+MAX_DESIGN_LAYERS+
        "-layer limit. Adjust its dimensions or remove another layer.");
      return;
    }
    setLayerError("");
    revision.current++;if(key)history.change(next,key);else history.set(next);
  }
  function add(kind: Exclude<DesignLayer["kind"], "frame">) {
    const layer=newLayer(kind);update([...layers,layer]);setSelected([layer.id]);
  }
  function change(id: string, updater: (layer: DesignLayer) => DesignLayer) {
    const previous=layers.find(l=>l.id===id);if(!previous)return;
    const next=updater(previous);
    const keys=Object.keys(next).filter(key=>JSON.stringify(next[key as keyof DesignLayer])!==JSON.stringify(previous[key as keyof DesignLayer]));
    update(layers.map(layer=>layer.id===id?next:layer),id+":"+keys.join(","));
  }
  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= layers.length) return;
    const changed = [...layers];
    [changed[index], changed[target]] = [changed[target], changed[index]];
    update(changed);
  }
  async function loadFont(id:string,file:File){
    try{
      const generation=revision.current;
      const font=await encodeLocalFont(file);
      if(!alive.current||generation!==revision.current)return;
      const next=live.current.map(layer=>layer.id===id&&layer.kind==="text"
        ?{...layer,...font,bundledFontId:undefined}:layer);
      await loadLocalFonts(next);
      if(!alive.current||generation!==revision.current)return;
      update(next);
    }catch(error){
      if(alive.current)setLayerError(error instanceof Error?error.message:"Unable to read this font.");
    }
  }
  function copy(layer: DesignLayer) {
    if (layer.kind === "frame") return;
    update([...layers, { ...layer, id: crypto.randomUUID(), name: layer.name + " copy",groupId:undefined,
      x: Math.min(layer.x + .03, 1 - layer.width), y: Math.min(layer.y + .03, 1 - layer.height) }]);
  }

 return <EditorWorkspace title="Frames & text" name={item.name} className="layers-workspace"
  onCancel={onClose} onApply={()=>{onChange({...item,layers});onClose();}}
  disabled={JSON.stringify(layers)===JSON.stringify(item.layers??[])}
  stage={<LayerCanvas imageUrl={previewUrl} ratio={item.widthMm/item.heightMm} widthMm={item.widthMm}
   layers={layers} onChange={next=>{revision.current++;history.set(next);}} selectedIds={selected} onSelect={setSelected}/>}
  tools={<><span>{item.widthMm} × {item.heightMm} mm</span><span>Shift + tap to select several · Alt to bypass snapping</span></>}
  undo={undo} redo={redo} canUndo={history.canUndo} canRedo={history.canRedo}>
  <div className="background-actions">
   <button className="secondary-button" disabled={atLimit} onClick={()=>add("text")}>+ Text</button>
   <button className="secondary-button" disabled={atLimit} onClick={()=>add("rectangle")}>+ Rectangle</button>
   <button className="secondary-button" disabled={atLimit} onClick={()=>add("ellipse")}>+ Ellipse</button>
  </div>
  <section className="frame-picker" aria-label={`${FRAME_PRESETS.length} frame styles`}>
   <h2>Frames <small>{FRAME_PRESETS.length} redesigned vector styles</small></h2>
   <label className="frame-search">Search designs
    <input type="search" aria-label="Search frame designs" value={frameSearch}
     onChange={event=>setFrameSearch(event.target.value)} placeholder="Find a theme or frame..." />
   </label>
   <div className="category-strip" role="group" aria-label="Frame categories">
    {Array.from(new Set(FRAME_PRESETS.map(p=>p.category))).map(name=><button key={name} className="secondary-button"
     aria-pressed={category===name} onClick={()=>setCategory(name)}>{name}</button>)}
   </div>
   <div className="frame-grid">
    {FRAME_PRESETS.filter(p=>frameSearch.trim() ?
     (p.name+" "+p.category).toLowerCase().includes(frameSearch.trim().toLowerCase()) : p.category===category)
     .map(preset=><button key={preset.id} type="button"
     className="frame-option" aria-label={"Apply "+preset.name+" frame"} aria-pressed={currentFrame?.frameId===preset.id}
     disabled={atLimit&&!currentFrame} onClick={()=>{
      const next=setFramePreset(layers,preset.id);update(next);setSelected([next.find(l=>l.kind==="frame")!.id]);
     }}>
     <span className="frame-thumbnail"><FrameSvg frameId={preset.id} widthMm={40} heightMm={30}
       weight={currentFrame?.frameId===preset.id?currentFrame.weight:1} color="#243c34"/></span>
     <span>{preset.name}</span>
    </button>)}
   </div>
   <button className="secondary-button" disabled={!currentFrame} onClick={()=>update(layers.filter(l=>l.kind!=="frame"))}>Remove frame</button>
  </section>
  {layerError&&<p className="banner danger" role="alert">{layerError}</p>}
  <h2>Layers <small>{layers.length}/100</small></h2>
  <div className="layer-stack" role="group" aria-label="Layer selection and ordering">
   {layers.map((layer,index)=><div className="layer-stack-row" key={layer.id}>
    <button className="secondary-button layer-select" aria-pressed={selected.includes(layer.id)} onClick={event=>{
     const ids=layer.groupId?layers.filter(l=>l.groupId===layer.groupId).map(l=>l.id):[layer.id];
     setSelected(event.shiftKey?[...new Set([...selected,...ids])]:ids);
    }}>{layer.name}{layer.groupId?" · grouped":""}</button>
    <div className="step-buttons">
     <button aria-label={"Toggle "+layer.name+" visibility"} aria-pressed={layer.visible} onClick={()=>change(layer.id,old=>({...old,visible:!old.visible}))}><StudioIcon name={layer.visible?"apply":"stop"} size={15}/></button>
     <button aria-label="Move layer back" disabled={index===0} onClick={()=>move(index,-1)}><StudioIcon name="down" size={15}/></button>
     <button aria-label="Move layer forward" disabled={index===layers.length-1} onClick={()=>move(index,1)}><StudioIcon name="up" size={15}/></button>
     <button aria-label="Duplicate layer" disabled={atLimit||layer.kind==="frame"} onClick={()=>copy(layer)}><StudioIcon name="duplicate" size={15}/></button>
     <button aria-label="Remove layer" onClick={()=>update(layers.filter(l=>l.id!==layer.id))}><StudioIcon name="close" size={15}/></button>
    </div>
   </div>)}
  </div>
  {chosen.length>0&&<div className="selection-tools">
   <div className="two-inputs">
    <button className="secondary-button" disabled={chosen.length<2} onClick={()=>{
     const groupId=crypto.randomUUID();update(layers.map(l=>chosen.includes(l)?{...l,groupId}:l));
    }}>Group selection</button>
    <button className="secondary-button" disabled={!chosen.some(l=>l.groupId)} onClick={()=>update(layers.map(l=>chosen.includes(l)?{...l,groupId:undefined}:l))}>Ungroup</button>
   </div>
   <div className="alignment-actions" role="group" aria-label="Align selected layers">
    {(["x","y"] as const).flatMap(axis=>(["start","center","end"] as const).map(position=><button key={axis+position}
     className="secondary-button" onClick={()=>update(alignSelection(layers,selected,axis,position))}>
     {axis==="x"?position==="start"?"Left":position==="center"?"Center":"Right":position==="start"?"Top":position==="center"?"Middle":"Bottom"}</button>))}
   </div>
  </div>}
  {layers.filter(layer=>selected.includes(layer.id)).slice(0,1).map(layer=><div className="layer-row" key={layer.id}>
   <h3>{selected.length>1?"First selected layer":layer.kind+" properties"}</h3>
        <div className="layer-controls">
          <label>Layer name
            <input type="text" maxLength={100} value={layer.name}
              onChange={(e) => change(layer.id, (old) => ({ ...old, name: e.target.value }))} />
          </label>
          <InlineColorField label="Color" value={layer.color}
            onChange={color=>change(layer.id,old=>({...old,color}))}/>
          <BoundedNumberField label="Layer opacity (%)" value={Math.round((layer.opacity??1)*100)}
            min={0} max={100} integer
            onCommit={value=>change(layer.id,old=>({...old,opacity:value/100}))}/>
          {layer.kind!=="frame" && (["x", "y", "width", "height"] as const).map(key=>
            <BoundedNumberField key={key} label={key.toUpperCase()+" (%)"}
              value={Math.round(layer[key]*100)} min={key==="x"||key==="y"?0:1}
              max={100} integer
              onCommit={percent=>change(layer.id,old=>setLayerPercent(old,key,percent))}/>
          )}
          {layer.kind==="frame" && <BoundedNumberField label="Frame thickness (%)"
            value={Math.round(layer.weight*100)} min={MIN_FRAME_WEIGHT*100} max={MAX_FRAME_WEIGHT*100} integer
            onCommit={value=>change(layer.id,old=>old.kind==="frame"?{...old,weight:value/100}:old)}/>}
          {layer.kind==="frame"&&<>
            <BoundedNumberField label="Frame inset (% short side)" value={Math.round((layer.inset??0)*1000)/10}
              min={0} max={20} step={.1} onCommit={v=>change(layer.id,old=>old.kind==="frame"?{...old,inset:v/100}:old)}/>
            <BoundedNumberField label="Motif spacing (%)" value={Math.round((layer.spacing??1)*100)}
              min={50} max={200} integer onCommit={v=>change(layer.id,old=>old.kind==="frame"?{...old,spacing:v/100}:old)}/>
          </>}
          {layer.kind === "text" && <>
            <label>Text
              <textarea rows={2} maxLength={300} value={layer.text}
                onChange={(e) => change(layer.id, (old) => old.kind === "text"
                  ? { ...old, text: e.target.value } : old)} />
            </label>
            {layer.bundledFontId&&firstUnsupportedBundledCharacter(layer.bundledFontId,layer.text)!==null&&
              <p className="warning" role="alert">This font does not contain every character in the text. Choose another font or upload one with the required characters.</p>}
            <BoundedNumberField label="Font size (pt)" value={layer.fontSizePt}
              min={4} max={180} integer
              onCommit={size=>change(layer.id,old=>old.kind==="text"
                ?{...old,fontSizePt:size}:old)}/>
            <label>Font family
              <select value={layer.fontData?"custom":layer.bundledFontId?"bundled:"+layer.bundledFontId:layer.fontFamily??"Helvetica"} onChange={event=>{
                const value=event.target.value;
                change(layer.id,old=>{
                  if(old.kind!=="text"||value==="custom")return old;
                  if(value.startsWith("bundled:")){
                    const id=value.slice(8);
                    return bundledFontById(id)?{...old,bundledFontId:id,fontFamily:undefined,
                      fontData:undefined,fontName:undefined}:old;
                  }
                  if(value!=="Helvetica"&&value!=="TimesRoman"&&value!=="Courier")return old;
                  return {...old,fontFamily:value,bundledFontId:undefined,fontData:undefined,fontName:undefined};
                });
              }}>
                <optgroup label="Standard PDF fonts"><option value="Helvetica">Helvetica</option>
                  <option value="TimesRoman">Times Roman</option><option value="Courier">Courier</option></optgroup>
                <optgroup label="Included fonts">{BUNDLED_FONTS.map(font=>
                  <option key={font.id} value={"bundled:"+font.id}>{font.name} · {font.category}</option>)}</optgroup>
                {layer.fontData&&<option value="custom">{layer.fontName??"Uploaded font"}</option>}
              </select>
              <span className="font-sample" style={{fontFamily:fontCssName(layer)}}>Aa · The quick brown fox</span>
            </label>
            <label>Custom TTF/OTF (embed in project and PDF, max 1.1 MB)
              <input type="file" accept=".ttf,.otf,font/ttf,font/otf"
                onChange={event=>{
                  const file=event.target.files?.[0];event.target.value="";
                  if(file)void loadFont(layer.id,file);
                }}/>
            </label>
            <label>Text alignment
              <select value={layer.align??"left"} onChange={event=>
                change(layer.id,old=>old.kind==="text"?
                  {...old,align:event.target.value as "left"|"center"|"right"}:old)}>
                <option value="left">Left</option><option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <BoundedNumberField label="Line height (× 100%)"
              value={Math.round((layer.lineHeightFactor??1.2)*100)}
              min={100} max={200} integer onCommit={v=>change(layer.id,old=>
                old.kind==="text"?{...old,lineHeightFactor:v/100}:old)}/>
            <BoundedNumberField label="Text outline (pt)"
              value={layer.outlinePt??0} min={0} max={4}
              onCommit={v=>change(layer.id,old=>old.kind==="text"?{...old,outlinePt:v}:old)}/>
            {(layer.outlinePt??0)>0&&<InlineColorField label="Outline color" value={layer.outlineColor??"#ffffff"}
              onChange={color=>change(layer.id,old=>old.kind==="text"?{...old,outlineColor:color}:old)}/>}
            <BoundedNumberField label="Text shadow offset (pt)"
              value={layer.shadowPt??0} min={0} max={12}
              onCommit={v=>change(layer.id,old=>old.kind==="text"?{...old,shadowPt:v}:old)}/>
            {(layer.shadowPt??0)>0&&<InlineColorField label="Shadow color" value={layer.shadowColor??"#333333"}
              onChange={color=>change(layer.id,old=>old.kind==="text"?{...old,shadowColor:color}:old)}/>}
          </>}
        </div>
  </div>)}
  {!layers.length&&<p className="hint">Choose a frame or add text and shapes. Apply saves one reversible edit.</p>}
  <button className="secondary-button" disabled={JSON.stringify(layers)===JSON.stringify(item.layers??[])} onClick={()=>{revision.current++;history.set(item.layers??[]);}}>Reset to saved layers</button>
  <p className="hint">Included and uploaded fonts embed in PDF. Check character coverage and make a physical proof.</p>
 </EditorWorkspace>;
}
