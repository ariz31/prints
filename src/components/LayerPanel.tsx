import type { PhotoAsset } from "../core/exportPdf.ts";
import {useState} from "react";
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

interface Props {
  item: PhotoAsset;
  previewUrl?:string;
  onChange: (item: PhotoAsset) => void;
  onClose: () => void;
}

export default function LayerPanel({ item, previewUrl, onChange, onClose }: Props) {
  const layers = item.layers ?? [];
  const currentFrame = layers.find((layer): layer is FrameLayer => layer.kind === "frame");
  const [layerError,setLayerError]=useState("");
  const atLimit=layers.length>=MAX_DESIGN_LAYERS;
  function update(next: DesignLayer[]) {
    if(!validDesignLayers(next)){
      setLayerError("A layer would exceed the design bounds or the "+MAX_DESIGN_LAYERS+
        "-layer limit. Adjust its dimensions or remove another layer.");
      return;
    }
    setLayerError("");
    onChange({ ...item, layers: next });
  }
  function add(kind: Exclude<DesignLayer["kind"], "frame">) {
    update([...layers, newLayer(kind)]);
  }
  function change(id: string, updater: (layer: DesignLayer) => DesignLayer) {
    update(layers.map((layer) => layer.id === id ? updater(layer) : layer));
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
      const font=await encodeLocalFont(file);
      const next=layers.map(layer=>layer.id===id&&layer.kind==="text"
        ?{...layer,...font,bundledFontId:undefined}:layer);
      await loadLocalFonts(next);
      update(next);
    }catch(error){
      setLayerError(error instanceof Error?error.message:"Unable to read this font.");
    }
  }
  function copy(layer: DesignLayer) {
    if (layer.kind === "frame") return;
    update([...layers, { ...layer, id: crypto.randomUUID(), name: layer.name + " copy",
      x: Math.min(layer.x + .03, 1 - layer.width), y: Math.min(layer.y + .03, 1 - layer.height) }]);
  }

  return <section className="layers-editor" aria-label="Frame, text and shape design layers">
    <div className="crop-toolbar">
      <div className="layer-toolbar-description"><h2>Design layers</h2>
        <p>{item.name} · Frames, text and shapes are duplicated with this print design.</p></div>
      <button className="secondary-button" type="button" aria-label="Close design layers editor" onClick={onClose}>Close</button>
    </div>
    <div className="background-actions">
      <button className="secondary-button" disabled={atLimit} onClick={() => add("text")}>+ Text</button>
      <button className="secondary-button" disabled={atLimit} onClick={() => add("rectangle")}>+ Rectangle</button>
      <button className="secondary-button" disabled={atLimit} onClick={() => add("ellipse")}>+ Ellipse</button>
    </div>
    <details className="frame-picker">
      <summary>Frames · 30 styles{currentFrame ? " · " + (FRAME_PRESETS.find(p=>p.id===currentFrame.frameId)?.name??"Selected") : ""}</summary>
      <p className="hint">Choose one frame. It stays inside the printed image and can be reordered with your text.</p>
      {Array.from(new Set(FRAME_PRESETS.map(p=>p.category))).map(category=><div key={category}>
        <h3>{category}</h3><div className="frame-grid">
          {FRAME_PRESETS.filter(p=>p.category===category).map(preset=><button
            key={preset.id} type="button" className="frame-option"
            aria-label={"Apply " + preset.name + " frame"}
            aria-pressed={currentFrame?.frameId===preset.id}
            disabled={atLimit&&!currentFrame}
            onClick={()=>update(setFramePreset(layers,preset.id))}>
            <span className="frame-thumbnail"><FrameSvg frameId={preset.id} widthMm={40}
              heightMm={30} weight={2.5} color="#243c34"/></span>
            <span>{preset.name}</span>
          </button>)}
        </div>
      </div>)}
      <div className="frame-picker-actions"><button className="secondary-button" type="button"
        disabled={!currentFrame} onClick={()=>update(layers.filter(layer=>layer.kind!=="frame"))}>Remove frame</button>
        {atLimit&&!currentFrame&&<span className="hint">Remove a layer before adding a frame.</span>}
      </div>
    </details>
    {layerError&&<p className="banner danger" role="alert">{layerError}</p>}
    {atLimit&&<p className="hint">This design has reached the 100-layer limit. Remove a layer to add another.</p>}
    <LayerCanvas imageUrl={previewUrl} ratio={item.widthMm/item.heightMm}
      widthMm={item.widthMm} layers={layers} onChange={update}/>
    {layers.length === 0 && <p className="hint">Choose a frame or add editable text and shapes. Layers appear on every repeated copy of this design.</p>}
    <div className="layer-list">
      {layers.map((layer, index) => <div className="layer-row" key={layer.id}>
        <div className="workflow-step-title">
          <label className="check-row"><input type="checkbox" checked={layer.visible}
            onChange={(e) => change(layer.id, (old) => ({ ...old, visible: e.target.checked }))} />
            {index + 1}. {layer.kind} — {layer.name}</label>
          <div className="step-buttons">
            <button aria-label="Move layer back" disabled={index === 0} onClick={() => move(index, -1)}>↓</button>
            <button aria-label="Move layer forward" disabled={index === layers.length - 1} onClick={() => move(index, 1)}>↑</button>
            <button aria-label="Duplicate layer" disabled={atLimit||layer.kind==="frame"} onClick={() => copy(layer)}>⧉</button>
            <button aria-label="Remove layer" onClick={() => update(layers.filter((v) => v.id !== layer.id))}>×</button>
          </div>
        </div>
        <div className="layer-controls">
          <label>Layer name
            <input type="text" maxLength={100} value={layer.name}
              onChange={(e) => change(layer.id, (old) => ({ ...old, name: e.target.value }))} />
          </label>
          <label>Color
            <input type="color" value={layer.color}
              onChange={(e) => change(layer.id, (old) => ({ ...old, color: e.target.value }))} />
          </label>
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
            {(layer.outlinePt??0)>0&&<label>Outline color
              <input type="color" value={layer.outlineColor??"#ffffff"} onChange={event=>
                change(layer.id,old=>old.kind==="text"?
                  {...old,outlineColor:event.target.value}:old)}/></label>}
            <BoundedNumberField label="Text shadow offset (pt)"
              value={layer.shadowPt??0} min={0} max={12}
              onCommit={v=>change(layer.id,old=>old.kind==="text"?{...old,shadowPt:v}:old)}/>
            {(layer.shadowPt??0)>0&&<label>Shadow color
              <input type="color" value={layer.shadowColor??"#333333"} onChange={event=>
                change(layer.id,old=>old.kind==="text"?
                  {...old,shadowColor:event.target.value}:old)}/></label>}
          </>}
        </div>
      </div>)}
    </div>
    <p className="hint">Layer coordinates are relative to the printed design, not the screen. PDF embeds included and uploaded TTF/OTF font subsets, keeping normal text as vectors. Imported fonts must allow document embedding. Verify non-Latin shaping, shadow/outline alignment and printer proofs before production.</p>
  </section>;
}
