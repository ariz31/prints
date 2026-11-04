import StudioSelect from "./StudioSelect.tsx";
import type {UserPreferences} from "../core/preferences.ts";
import type {DisplayUnit} from "../core/units.ts";
import type {Orientation} from "../core/layout.ts";
import type {CustomPaperSize} from "../core/paperLibrary.ts";
import DimensionField from "./DimensionField.tsx";
import PaperSizePicker from "./PaperSizePicker.tsx";
import CustomPaperManager from "./CustomPaperManager.tsx";
import StudioIcon from "./StudioIcon.tsx";

export default function PreferencesPanel({preferences,customPapers,onChange,onPaperLibraryChange,onClose}:{
 preferences:UserPreferences;
 customPapers:readonly CustomPaperSize[];
 onChange:(p:UserPreferences)=>void;
 onPaperLibraryChange:(papers:CustomPaperSize[])=>void;
 onClose:()=>void;
}){
 const set=<K extends keyof UserPreferences>(key:K,value:UserPreferences[K])=>onChange({...preferences,[key]:value});
 return <section className="preferences-panel" aria-label="Print defaults">
  <div className="panel-heading"><h2 className="panel-title-with-icon">
    <StudioIcon name="settings" size={18}/><span>Preferences</span></h2>
    <button aria-label="Close preferences" className="icon-button" onClick={onClose}>
      <StudioIcon name="close" size={18}/></button></div>
  <div className="preferences-grid">
   <div className="paper-picker-field"><span>Default paper</span>
     <PaperSizePicker paper={preferences.defaultPaper}
       customWidthMm={preferences.defaultCustomWidthMm??210}
       customHeightMm={preferences.defaultCustomHeightMm??297}
       customPapers={customPapers} label="Default paper"
       onSelect={selection=>onChange({...preferences,defaultPaper:selection.paper,
         defaultCustomWidthMm:selection.customWidthMm,defaultCustomHeightMm:selection.customHeightMm})}/>
   </div>
   <label>Orientation<StudioSelect value={preferences.defaultOrientation}
     onChange={e=>set("defaultOrientation",e.target.value as Orientation)}>
    <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
   </StudioSelect></label>
   {preferences.defaultPaper==="Custom"&&<>
     <DimensionField label="Custom default width" unit={preferences.unit}
       valueMm={preferences.defaultCustomWidthMm??210} minMm={0.001} maxMm={2000}
       onCommit={value=>set("defaultCustomWidthMm",value)}/>
     <DimensionField label="Custom default height" unit={preferences.unit}
       valueMm={preferences.defaultCustomHeightMm??297} minMm={0.001} maxMm={2000}
       onCommit={value=>set("defaultCustomHeightMm",value)}/>
   </>}
   <label>Units<StudioSelect value={preferences.unit} onChange={e=>set("unit",e.target.value as DisplayUnit)}>
    <option value="mm">Millimeters</option><option value="cm">Centimeters</option><option value="in">Inches</option>
   </StudioSelect></label>
   <DimensionField label="Default margin" unit={preferences.unit} valueMm={preferences.defaultMarginMm}
     minMm={0} maxMm={199.999} onCommit={v=>set("defaultMarginMm",v)}/>
   <DimensionField label="Default gap" unit={preferences.unit} valueMm={preferences.defaultGapMm}
     minMm={0} maxMm={199.999} onCommit={v=>set("defaultGapMm",v)}/>
   <label>Autosave<StudioSelect value={preferences.autoSave===false?"no":"yes"}
     onChange={e=>set("autoSave",e.target.value==="yes")}>
    <option value="yes">On (saved projects)</option><option value="no">Off</option></StudioSelect></label>
   <label>Cut lines<StudioSelect value={preferences.defaultCutGuides?"yes":"no"}
     onChange={e=>set("defaultCutGuides",e.target.value==="yes")}>
    <option value="yes">On</option><option value="no">Off</option></StudioSelect></label>
  </div>
  {preferences.defaultPaper==="Custom"&&
    <p className="preferences-hint">Custom defaults apply to new jobs. To reuse a named size, save it below.</p>}
  <CustomPaperManager customPapers={customPapers} onPaperLibraryChange={onPaperLibraryChange}/>
  <p className="preferences-hint">Saved on this device · Defaults apply to new jobs only.</p>
 </section>;
}
