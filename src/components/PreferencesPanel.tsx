import type { UserPreferences } from "../core/preferences.ts";
import type { DisplayUnit } from "../core/units.ts";
import type { PaperName,Orientation } from "../core/layout.ts";
import DimensionField from "./DimensionField.tsx";
export default function PreferencesPanel({preferences,onChange,onClose}:{
 preferences:UserPreferences;onChange:(p:UserPreferences)=>void;onClose:()=>void;
}){
 const set=<K extends keyof UserPreferences>(key:K,value:UserPreferences[K])=>onChange({...preferences,[key]:value});
 return <section className="preferences-panel" aria-label="Print defaults">
  <div className="panel-heading"><h2>Preferences</h2>
   <button aria-label="Close preferences" className="icon-button" onClick={onClose}>×</button></div>
  <div className="preferences-grid">
   <label>Units<select value={preferences.unit} onChange={e=>set("unit",e.target.value as DisplayUnit)}>
    <option value="mm">Millimeters</option><option value="cm">Centimeters</option><option value="in">Inches</option>
   </select></label>
   <label>Default paper<select value={preferences.defaultPaper}
    onChange={e=>set("defaultPaper",e.target.value as PaperName)}>
    {["A4","A3","Letter","Legal","Long Bond","Custom"].map(s=><option key={s}>{s}</option>)}
   </select></label>
   <label>Orientation<select value={preferences.defaultOrientation}
    onChange={e=>set("defaultOrientation",e.target.value as Orientation)}>
    <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
   </select></label>
   <DimensionField label="Default margin" unit={preferences.unit} valueMm={preferences.defaultMarginMm}
     minMm={0} onCommit={v=>set("defaultMarginMm",v)}/>
   <DimensionField label="Default gap" unit={preferences.unit} valueMm={preferences.defaultGapMm}
     minMm={0} onCommit={v=>set("defaultGapMm",v)}/>
   <label>Autosave<select value={preferences.autoSave===false?"no":"yes"}
    onChange={e=>set("autoSave",e.target.value==="yes")}>
    <option value="yes">On (saved projects)</option><option value="no">Off</option></select></label>
   <label>Cut lines<select value={preferences.defaultCutGuides?"yes":"no"}
    onChange={e=>set("defaultCutGuides",e.target.value==="yes")}>
    <option value="yes">On</option><option value="no">Off</option></select></label>
  </div>
  <p className="hint">Preferences apply locally. Autosave updates only projects you've explicitly saved.</p>
 </section>;
}
