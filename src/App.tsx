import { useMemo, useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent,KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  PAPER_SIZES, composeSheets, getPaperDimensions, pageUtilization, MM_PER_INCH,
} from "./core/layout.ts";
import type { LayoutOptions, Orientation, PaperName, SheetPage } from "./core/layout.ts";
import { exportToPdf } from "./core/exportPdf.ts";
import type { PhotoAsset } from "./core/exportPdf.ts";
import { exactCropSourceRect, fitCropToAspect, FULL_CROP } from "./core/crop.ts";
import { assertSafeSourceSize, withProcessedImage } from "./core/assetIntegrity.ts";
import { rasterizeCrop } from "./core/imageRaster.ts";
import {
  createProjectSnapshot, deleteProject, listProjects, loadProject, materializeProject,
  saveProject,
} from "./core/projectStore.ts";
import type { ProjectSettings as Preferences, ProjectSummary } from "./core/projectStore.ts";
import { makeStep, recordSemanticStep } from "./core/workflowEngine.ts";
import type { WorkflowStep } from "./core/workflow.ts";
import CropEditor from "./components/CropEditor.tsx";
import BackgroundEditor from "./components/BackgroundEditor.tsx";
import LayerPanel from "./components/LayerPanel.tsx";
import WorkflowPanel from "./components/WorkflowPanel.tsx";
import { createProjectArchive, readProjectArchive } from "./core/projectArchive.ts";
import { createCalibrationPdf } from "./core/calibration.ts";
import { lookupPrintSize, PRINT_SIZE_PRESETS } from "./core/dimensions.ts";
import { readPreferences,savePreferences,defaultPrintSettings } from "./core/preferences.ts";
import type { UserPreferences } from "./core/preferences.ts";
import { formatLength } from "./core/units.ts";
import DimensionField from "./components/DimensionField.tsx";
import PreferencesPanel from "./components/PreferencesPanel.tsx";
import StudioIcon from "./components/StudioIcon.tsx";
import HelpTip from "./components/HelpTip.tsx";
import { DEFAULT_ADJUSTMENTS } from "./core/photoAdjustments.ts";
import { exportDesignPng,outputPngName } from "./core/exportPng.ts";
import { duplicatePrintDesign,canRevokeImageUrl } from "./core/duplicateDesign.ts";
import { readPresetLibrary,writePresetLibrary } from "./core/presetLibrary.ts";
import type { NamedPreset } from "./core/presetLibrary.ts";
import { emptyHistory,pushHistory,travelHistory } from "./core/history.ts";
import { assessPrintJob } from "./core/printPreflight.ts";
import { cornerCutLines } from "./core/cutMarks.ts";
import { selectPages } from "./core/pageSelection.ts";
import { applyManualPlacements,moveManualPlacement } from "./core/manualLayout.ts";
import type { ManualPlacement } from "./core/manualLayout.ts";
import type { TrimStyle } from "./core/cutMarks.ts";
import type { History } from "./core/history.ts";


const MAX_FILES = 25;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

async function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        assertSafeSourceSize(img.naturalWidth,img.naturalHeight);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      } catch (error) { reject(error); }
    };
    img.onerror = () => reject(new Error("An imported image could not be read."));
    img.src = url;
  });
}

function numberInput(value: number, update: (value: number) => void, min = 0, step = 1) {
  return <input type="number" value={value} min={min} step={step}
    onChange={(event) => update(Number(event.target.value))} />;
}

function AssetCard({ item, unit, onChange, onRemove, onCrop, onBackground, onLayers, onDownload, onDuplicate }: {
  item: PhotoAsset;
  unit: UserPreferences["unit"];
  onChange: (value: PhotoAsset) => void;
  onRemove: () => void;
  onCrop: () => void;
  onBackground: () => void;
  onLayers: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
}) {
  // Invalid imported data must not crash the entire workspace render.
  let dpi = Number.NaN;
  try {
    const c = exactCropSourceRect(item.processedWidth??item.pixelWidth,
      item.processedHeight??item.pixelHeight,item.crop,item.widthMm,item.heightMm);
    dpi=Math.floor(Math.min(c.sw/(item.widthMm/MM_PER_INCH),c.sh/(item.heightMm/MM_PER_INCH)));
  } catch { /* Export and crop editing report actionable dimensions separately. */ }
  return <article className="asset-card">
    <div className="asset-heading">
      <img className="asset-thumbnail" src={item.processedUrl ?? item.url} alt="" />
      <div className="asset-name"><strong title={item.name}>{item.name}</strong>
        <small>{item.pixelWidth} × {item.pixelHeight} px</small></div>
      <button className="icon-button" title={"Remove " + item.name} aria-label={"Remove " + item.name} onClick={onRemove}>×</button>
    </div>
    <div className="three-inputs">
      <button className="secondary-button" onClick={onCrop}>Crop</button>
      <button className="secondary-button" onClick={onBackground}>Background</button>
      <button className="secondary-button" onClick={onLayers}>Layers ({item.layers?.length ?? 0})</button>
    </div>
    <label title="Use a common size or enter an exact dimension below.">Size preset
      <select value="" onChange={(event) => {
        if (!event.target.value) return;
        const size = lookupPrintSize(event.target.value);
        onChange({ ...item, ...size });
      }}>
        <option value="">Select a preset…</option>
        {PRINT_SIZE_PRESETS.map((preset) =>
          <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
    </label>
    <div className="three-inputs">
      <DimensionField label="Width" unit={unit} valueMm={item.widthMm}
        onCommit={v=>onChange({...item,widthMm:v})}/>
      <DimensionField label="Height" unit={unit} valueMm={item.heightMm}
        onCommit={v=>onChange({...item,heightMm:v})}/>
      <label>Copies{numberInput(item.quantity,(v)=>onChange({...item,quantity:v}),1,1)}</label>
    </div>
    <details className="advanced-options">
      <summary>Photo adjustments</summary>
      {(["brightness","contrast","saturation"] as const).map(k=>
        <label key={k} className="photo-adjust">
          <span>{k[0].toUpperCase()+k.slice(1)}
            <strong>{item.adjustments?.[k]??0}</strong></span>
          <input type="range" min={-100} max={k==="saturation"?200:100}
            value={item.adjustments?.[k]??0} onChange={e=>onChange({...item,
            adjustments:{...DEFAULT_ADJUSTMENTS,...item.adjustments,[k]:Number(e.target.value)}})}/>
        </label>)}
      <button className="secondary-button" onClick={()=>onChange({...item,adjustments:undefined})}>
        Reset photo adjustments</button>
    </details>
    <div className="two-inputs">
      <button className="secondary-button" onClick={onDuplicate}
        title="Create another independently cropped design from this same original image">
        Duplicate design</button>
      <button className="secondary-button" title="Download the cropped image with text, shapes and photo adjustments"
        onClick={onDownload}>Download PNG</button>
    </div>
    {Number.isFinite(dpi) && dpi < 150 && <p className="warning">Low resolution: approximately {dpi} DPI at requested size.</p>}
  </article>;
}

function SheetPreview({ page, paper, items, previews, guides, trimStyle, index, arrange, onMove }: {
  page: SheetPage;
  paper: { widthMm: number; heightMm: number };
  items: ReadonlyArray<PhotoAsset>;
  previews: Record<string, string>;
  guides: boolean;
  trimStyle:TrimStyle;
  index: number;
  arrange:boolean;
  onMove:(itemId:string,copyIndex:number,xMm:number,yMm:number)=>void;
}) {
  const sheetRef=useRef<HTMLDivElement>(null);
  const dragRef=useRef<{id:string;copy:number;pointer:number;
    originX:number;originY:number;clientX:number;clientY:number}|null>(null);
  const [draft,setDraft]=useState<{id:string;copy:number;xMm:number;yMm:number}|null>(null);
  const lookup = new Map(items.map((item) => [item.id, item]));
  function placeForPointer(event:ReactPointerEvent<HTMLDivElement>){
    const drag=dragRef.current;
    const bounds=sheetRef.current?.getBoundingClientRect();
    if(!drag||!bounds||bounds.width<=0||bounds.height<=0)return null;
    return {id:drag.id,copy:drag.copy,
      xMm:drag.originX+(event.clientX-drag.clientX)/bounds.width*paper.widthMm,
      yMm:drag.originY+(event.clientY-drag.clientY)/bounds.height*paper.heightMm};
  }
  function move(event:ReactPointerEvent<HTMLDivElement>){
    if(!arrange||dragRef.current?.pointer!==event.pointerId)return;
    const next=placeForPointer(event);
    if(next)setDraft(next);
  }
  function finish(event:ReactPointerEvent<HTMLDivElement>,cancel=false){
    if(dragRef.current?.pointer!==event.pointerId)return;
    const next=placeForPointer(event);
    dragRef.current=null;setDraft(null);
    if(!cancel&&next)onMove(next.id,next.copy,next.xMm,next.yMm);
  }
  function nudge(event:ReactKeyboardEvent<HTMLDivElement>,p:SheetPage["placements"][number]){
    if(!arrange)return;
    const moves:Record<string,[number,number]>={
      ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],
    };
    const change=moves[event.key];
    if(!change)return;
    event.preventDefault();
    const step=event.shiftKey?.1:1;
    onMove(p.itemId,p.copyIndex,p.xMm+change[0]*step,p.yMm+change[1]*step);
  }
  return <div className="sheet-wrap">
    <div ref={sheetRef} className={"sheet"+(arrange?" sheet-arrange":"")}
      role={arrange?"group":"img"} aria-label={"Preview of sheet " + (index + 1)}
      style={{ aspectRatio: String(paper.widthMm) + " / " + String(paper.heightMm) }}>
      {page.placements.map((placement) => {
        const item = lookup.get(placement.itemId);
        if (!item) return null;
        const moving=draft?.id===placement.itemId&&draft.copy===placement.copyIndex;
        const xMm=moving?draft.xMm:placement.xMm;
        const yMm=moving?draft.yMm:placement.yMm;
        return <div key={placement.itemId + "-" + placement.copyIndex}
          className={"placed"+(arrange?" movable-print":"")+
            (guides && trimStyle==="outline" ? " with-guides" : "")}
          role={arrange?"button":undefined} tabIndex={arrange?0:undefined}
          aria-label={arrange?"Move "+item.name+" copy "+(placement.copyIndex+1):undefined}
          onKeyDown={event=>nudge(event,placement)}
          onPointerDown={event=>{
            if(!arrange)return;
            event.preventDefault();
            dragRef.current={id:placement.itemId,copy:placement.copyIndex,
              pointer:event.pointerId,originX:placement.xMm,originY:placement.yMm,
              clientX:event.clientX,clientY:event.clientY};
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={move} onPointerUp={event=>finish(event)}
          onPointerCancel={event=>finish(event,true)}
          style={{
            left: String(xMm / paper.widthMm * 100) + "%",
            top: String(yMm / paper.heightMm * 100) + "%",
            width: String(placement.widthMm / paper.widthMm * 100) + "%",
            height: String(placement.heightMm / paper.heightMm * 100) + "%",
          }}>
          {previews[item.id] ? <img src={previews[item.id]} alt="" draggable={false} /> :
            <div className="photo-loading" aria-label="Preparing exact crop preview" />}
          {(item.layers ?? []).filter((layer) => layer.visible).map((layer) =>
            <div key={layer.id} className={"print-layer print-layer-" + layer.kind} style={{
              left: layer.x * 100 + "%", top: layer.y * 100 + "%",
              width: layer.width * 100 + "%", height: layer.height * 100 + "%",
              color: layer.color,
              backgroundColor: layer.kind === "text" ? "transparent" : layer.color,
              fontSize: layer.kind === "text"
                ? String(layer.fontSizePt / 72 * 25.4 / item.widthMm * 100) + "cqw" : undefined,
            }}>{layer.kind === "text" ? layer.text : null}</div>)}
        </div>;
      })}
      {guides && trimStyle==="corner" && <svg className="corner-cut-overlay"
        aria-hidden="true" viewBox={"0 0 "+paper.widthMm+" "+paper.heightMm}
        preserveAspectRatio="none">
        {page.placements.flatMap((p)=>{
          const d=draft?.id===p.itemId&&draft.copy===p.copyIndex;
          return cornerCutLines(d?{...p,xMm:d.xMm,yMm:d.yMm}:p);
        }).map((line,i)=>
          <line key={i} x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2} stroke="#46514f" strokeWidth=".12"/>)}
      </svg>}
    </div>
    <div className="sheet-caption">Sheet {index + 1} · {page.placements.length} items · {Math.round(pageUtilization(page, {
      paperWidthMm: paper.widthMm, paperHeightMm: paper.heightMm, marginMm: 0, gapMm: 0,
    }) * 100)}% area used</div>
  </div>;
}

export default function App() {
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  type Snapshot={items:PhotoAsset[]; print:Preferences};
  const history=useRef<History<Snapshot>>(emptyHistory<Snapshot>());
  const [historyCount,setHistoryCount]=useState({undo:0,redo:0});
  const [userPrefs,setUserPrefs]=useState<UserPreferences>(readPreferences);
  const [savedPresets,setSavedPresets]=useState<NamedPreset[]>(readPresetLibrary);
  const [presetName,setPresetName]=useState("My print layout");
  const [selectedPreset,setSelectedPreset]=useState("");
  const [settings, setSettings] = useState<Preferences>(()=>defaultPrintSettings(readPreferences()));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [previewIndex,setPreviewIndex]=useState(0);
  const [pageRange,setPageRange]=useState("all");
  const [arrangeMode,setArrangeMode]=useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled print job");
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [autoSaveStatus,setAutoSaveStatus]=useState<"idle"|"saving"|"saved"|"failed">("idle");
  const saveSequence=useRef(0);
  const [cropId, setCropId] = useState<string | null>(null);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [mobileView,setMobileView]=useState<"preview"|"print"|"images">("preview");
  const [showPreferences,setShowPreferences]=useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<WorkflowStep[]>([]);
  const objectUrls = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  function historyChanged() {
    setHistoryCount({undo:history.current.undo.length,redo:history.current.redo.length});
  }
  function resetHistory() {history.current=emptyHistory<Snapshot>();historyChanged();}
  function rememberEdit() {
    history.current=pushHistory(history.current,{items:assets,print:settings},50);
    historyChanged();
  }
  function travel(direction:"undo"|"redo") {
    const next=travelHistory(history.current,{items:assets,print:settings},direction);
    if(!next)return;
    history.current=next.history;
    setAssets(next.value.items);
    setSettings(next.value.print);
    historyChanged();
    setError("");
    setNotice(direction==="undo"?"Edit undone.":"Edit redone.");
  }
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target;
      if(target instanceof HTMLElement &&
        (target.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(target.tagName)))return;
      if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
      const key=event.key.toLowerCase();
      if(key==="z"||key==="y"){
        event.preventDefault();
        const direction=key==="y"||(key==="z"&&event.shiftKey)?"redo":"undo";
        travel(direction);
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  });

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    void listProjects().then(setProjectList).catch(() => {
      // Browser storage may be disabled; the rest of the editor remains available.
    });
  }, []);

  // Raster previews are processed one at a time to avoid decoding 25 images
  // concurrently on low-memory phones. Quantities/layers do not trigger new crops.
  const previewSignature = JSON.stringify(assets.map((a) =>
    [a.id,a.url,a.processedUrl,a.widthMm,a.heightMm,a.crop,a.adjustments]));
  useEffect(() => {
    let cancelled = false;
    const temporary: string[] = [];
    setPreviews({});
    void (async () => {
      const progressive: Record<string,string> = {};
      for(const asset of assets){
        if(cancelled)return;
        const output=await rasterizeCrop(asset,120);
        if(cancelled)return;
        const url=URL.createObjectURL(output);
        temporary.push(url);
        progressive[asset.id]=url;
        setPreviews({...progressive});
      }
    })().catch((cause:unknown)=>{
      if(!cancelled){
        setError("Preview failed: "+displayError(cause));
      }
    });
    return () => {
      cancelled = true;
      for(const url of temporary) URL.revokeObjectURL(url);
    };
  // previewSignature represents exactly the image transformations that affect cropping
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSignature]);

  function recordStep(step: WorkflowStep) {
    if (recording) setRecordedSteps((history) => recordSemanticStep(history, step));
  }

  // Local autosave is debounced and uses generation fencing: an earlier job
  // cannot overwrite a newer project after the user switches workspaces.
  useEffect(()=>{
    const generation=++saveSequence.current;
    if(!projectId||userPrefs.autoSave===false)return;
    setAutoSaveStatus("idle");
    const timer=window.setTimeout(()=>{
      void (async()=>{
        if(generation!==saveSequence.current)return;
        setAutoSaveStatus("saving");
        try{
          const snapshot=await createProjectSnapshot(projectId,projectName,settings,assets);
          if(generation!==saveSequence.current)return;
          await saveProject(snapshot);
          if(generation===saveSequence.current){
            setAutoSaveStatus("saved");
          }
        }catch(cause){
          if(generation===saveSequence.current){
            setAutoSaveStatus("failed");
            setError("Local autosave failed: "+displayError(cause));
          }
        }
      })();
    },10000);
    return()=>{window.clearTimeout(timer);saveSequence.current++;};
  },[projectId,projectName,settings,assets,userPrefs.autoSave]);

  async function refreshProjectList() {
    setProjectList(await listProjects());
  }

  async function saveCurrentProject() {
    setProjectBusy(true); setError("");
    try {
      const id = projectId ?? crypto.randomUUID();
      await saveProject(await createProjectSnapshot(id, projectName, settings, assets));
      setProjectId(id);
      setAutoSaveStatus("saved");
      setSelectedProject(id);
      await refreshProjectList();
      setNotice("Project saved locally, including original images and crop selections.");
    } catch (cause) {
      setError(displayError(cause));
    } finally { setProjectBusy(false); }
  }

  async function openSavedProject() {
    if (!selectedProject) return;
    setProjectBusy(true); setError("");
    try {
      const project = await loadProject(selectedProject);
      const imported = materializeProject(project);
      const oldUrls = [...objectUrls.current];
      objectUrls.current = new Set(imported.flatMap((asset) =>
        [asset.url, ...(asset.processedUrl ? [asset.processedUrl] : [])]));
      resetHistory();
      setAssets(imported);
      setSettings(project.settings);
      setProjectId(project.id);
      setAutoSaveStatus("saved");
      setProjectName(project.name);
      setCropId(null);
      setBackgroundId(null);
      setLayerId(null);
      setRecordedSteps([]);
      setNotice("Saved project reopened with original source images.");
      for (const url of oldUrls) URL.revokeObjectURL(url);
    } catch (cause) {
      setError(displayError(cause));
    } finally { setProjectBusy(false); }
  }


  async function exportPortableBackup() {
    setProjectBusy(true); setError("");
    try {
      const snapshot = await createProjectSnapshot(projectId ?? crypto.randomUUID(),
        projectName, settings, assets);
      const backup = await createProjectArchive(snapshot);
      const url = URL.createObjectURL(backup);
      const link = document.createElement("a");
      link.href = url;
      link.download = (projectName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) ||
        "prints-project") + ".prints.json";
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice("Portable backup downloaded with all original/processed images and design data.");
    } catch (cause) {
      setError(displayError(cause));
    } finally { setProjectBusy(false); }
  }

  async function importPortableBackup(file: File) {
    if (assets.length > 0 && !window.confirm(
      "Importing will replace the current workspace. Save any unsaved work first. Continue?")) return;
    setProjectBusy(true); setError("");
    try {
      const imported = await readProjectArchive(file);
      await saveProject(imported);
      const materialized = materializeProject(imported);
      const oldUrls = [...objectUrls.current];
      objectUrls.current = new Set(materialized.flatMap((asset) =>
        [asset.url, ...(asset.processedUrl ? [asset.processedUrl] : [])]));
      resetHistory();
      setAssets(materialized);
      setSettings(imported.settings);
      setProjectId(imported.id);
      setAutoSaveStatus("saved");
      setProjectName(imported.name);
      setSelectedProject(imported.id);
      setCropId(null); setBackgroundId(null); setLayerId(null);
      setRecordedSteps([]);
      await refreshProjectList();
      for (const url of oldUrls) URL.revokeObjectURL(url);
      setNotice("Portable project imported into local storage. Original project IDs were not overwritten.");
    } catch (cause) {
      setError(displayError(cause));
    } finally { setProjectBusy(false); }
  }

  function handleBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importPortableBackup(file);
  }

  async function removeSavedProject() {
    if (!selectedProject || !window.confirm("Delete the selected saved project from this browser?")) return;
    setProjectBusy(true);
    try {
      await deleteProject(selectedProject);
      if (projectId === selectedProject) setProjectId(null);
      setSelectedProject("");
      await refreshProjectList();
      setNotice("Saved project deleted. The current workspace remains open.");
    } catch (cause) { setError(displayError(cause)); }
    finally { setProjectBusy(false); }
  }

  function startNewProject() {
    if(assets.length>0 && !window.confirm("Start a new print job? Save or download a backup before discarding unsaved changes."))return;
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    resetHistory();
    setAssets([]); setSettings(defaultPrintSettings(userPrefs)); setProjectId(null);
    setAutoSaveStatus("idle"); setProjectName("Untitled print job");
    setSelectedProject(""); setCropId(null); setBackgroundId(null); setLayerId(null);
    setNotice("New blank project created.");
  }

  const paper = getPaperDimensions(settings.paper, settings.orientation,
    { widthMm: settings.customWidthMm, heightMm: settings.customHeightMm });
  const layoutOptions: LayoutOptions = {
    paperWidthMm: paper.widthMm,
    paperHeightMm: paper.heightMm,
    marginMm: settings.marginMm,
    gapMm: settings.gapMm,
    packing: settings.packing??"compact",
  };
  const result = useMemo(() => {
    try {
      const automatic=composeSheets(assets,layoutOptions);
      return {pages:applyManualPlacements(automatic,settings.manualPlacements??[],layoutOptions),
        automatic,message:""};
    } catch (cause) {
      return {pages:[] as SheetPage[],automatic:[] as SheetPage[],message:displayError(cause)};
    }
  }, [assets,paper.widthMm,paper.heightMm,settings.marginMm,settings.gapMm,
      settings.packing,settings.manualPlacements]);
  const totalCopies = assets.reduce((sum, asset) => sum + (Number.isFinite(asset.quantity) ? asset.quantity : 0), 0);
  const safePreviewIndex=Math.min(previewIndex,Math.max(0,result.pages.length-1));
  const selection=useMemo(()=>{
    try {
      const indices=selectPages(pageRange,result.pages.length);
      return {pages:indices.map(i=>result.pages[i]),error:""};
    }catch(cause){return {pages:[] as SheetPage[],error:displayError(cause)};}
  },[result.pages,pageRange]);
  const selectedAssetIds=new Set(selection.pages.flatMap(page=>
    page.placements.map(placement=>placement.itemId)));
  const selectedAssets=assets.filter(asset=>selectedAssetIds.has(asset.id));
  const preflight=useMemo(()=>assessPrintJob(selectedAssets,selection.pages,paper,settings),
    [selectedAssets,selection.pages,paper.widthMm,paper.heightMm,settings]);

  function moveOnSheet(itemId:string,copyIndex:number,xMm:number,yMm:number){
    try{
      const next=moveManualPlacement(result.automatic,settings.manualPlacements??[],
        layoutOptions,safePreviewIndex,itemId,copyIndex,xMm,yMm);
      rememberEdit();
      setSettings(old=>({...old,manualPlacements:next}));
      setError("");setNotice("Copy position updated. PDF export uses the same coordinates.");
    }catch(cause){setError(displayError(cause));}
  }
  function resetSheetArrangement(){
    if(!settings.manualPlacements?.length)return;
    rememberEdit();
    setSettings(old=>({...old,manualPlacements:[]}));
    setError("");setNotice("Automatic arrangement restored.");
  }

  async function addFiles(files: FileList | File[]) {
    setError("");
    setNotice("");
    if (assets.length + files.length > MAX_FILES) {
      setError("Limit: up to " + MAX_FILES + " source images per job in this initial release.");
      return;
    }
    const created: PhotoAsset[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!IMAGE_TYPES.has(file.type)) throw new Error("Supported formats: JPG, PNG, and WebP.");
        if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error("Each image must be nonempty and no larger than 25 MB.");
        const url = URL.createObjectURL(file);
        try {
          const dimensions = await imageDimensions(url);
          created.push({
            id: crypto.randomUUID(), name: file.name, url,
            pixelWidth: dimensions.width, pixelHeight: dimensions.height,
            widthMm: 50.8, heightMm: 50.8, quantity: 12, focalX: 50, focalY: 50,
            crop: fitCropToAspect(FULL_CROP,dimensions.width,dimensions.height,50.8,50.8),
          });
          objectUrls.current.add(url);
        } catch (cause) {
          URL.revokeObjectURL(url);
          throw cause;
        }
      }
      resetHistory();
      setSettings(old=>({...old,manualPlacements:[]}));
      setAssets((current) => [...current, ...created]);
    } catch (cause) {
      for (const asset of created) {
        URL.revokeObjectURL(asset.url);
        objectUrls.current.delete(asset.url);
      }
      setError(displayError(cause));
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  }

  function updateItem(value: PhotoAsset) {
    const before = assets.find((item) => item.id === value.id);
    if(!before)return;
    if(JSON.stringify(before)===JSON.stringify(value))return;
    rememberEdit();
    if(value.widthMm!==before.widthMm||value.heightMm!==before.heightMm||
       value.quantity!==before.quantity)
      setSettings(old=>({...old,manualPlacements:[]}));
    if(before && (value.widthMm!==before.widthMm || value.heightMm!==before.heightMm) &&
      Number.isFinite(value.widthMm) && value.widthMm>0 &&
      Number.isFinite(value.heightMm) && value.heightMm>0){
      value={...value,crop:fitCropToAspect(value.crop,
        value.processedWidth??value.pixelWidth,value.processedHeight??value.pixelHeight,
        value.widthMm,value.heightMm)};
      setNotice("Crop frame adjusted to the new print ratio. Open Crop to review.");
    }
    setAssets((current) => current.map((asset) => asset.id === value.id ? value : asset));
    if (!before) return;
    if (before.widthMm !== value.widthMm || before.heightMm !== value.heightMm) {
      recordStep(makeStep("crop.to-size", { widthMm: value.widthMm, heightMm: value.heightMm }));
    }
    if (before.quantity !== value.quantity) recordStep(makeStep("copies.set", { quantity: value.quantity }));
    if(JSON.stringify(before.adjustments)!==JSON.stringify(value.adjustments))
      recordStep(makeStep("image.adjust",{...DEFAULT_ADJUSTMENTS,...value.adjustments}));
    if (before.focalX !== value.focalX || before.focalY !== value.focalY) {
      recordStep(makeStep("crop.center", { focalX: value.focalX, focalY: value.focalY }, "on-uncertainty"));
    }
    if (JSON.stringify(before.crop) !== JSON.stringify(value.crop)) {
      recordStep(makeStep("review.manual",
        { message: "Inspect the photo-specific crop selection on any replacement image." }, "always"));
    }
    if (JSON.stringify(before.layers) !== JSON.stringify(value.layers)) {
      recordStep(makeStep("review.manual",
        { message: "Inspect editable design layers when processing a different image." }, "always"));
    }
  }

  function duplicateItem(item:PhotoAsset){
    if(assets.length>=MAX_FILES){
      setError("This print job supports up to "+MAX_FILES+" independently editable designs.");
      return;
    }
    const duplicated=duplicatePrintDesign(item,crypto.randomUUID(),
      (item.layers??[]).map(()=>crypto.randomUUID()));
    resetHistory();
    setAssets(current=>[...current,duplicated]);
    setSettings(old=>({...old,manualPlacements:[]}));
    setNotice("Design duplicated. Set a different crop, size or quantity without reimporting.");
  }

  function removeItem(item: PhotoAsset) {
    resetHistory();
    const remaining=assets.filter(asset=>asset.id!==item.id);
    setAssets(remaining);
    setSettings(old=>({...old,manualPlacements:[]}));
    for(const url of [item.url,item.processedUrl].filter((u):u is string=>!!u)){
      if(canRevokeImageUrl(url,remaining)){
        objectUrls.current.delete(url);
        URL.revokeObjectURL(url);
      }
    }
    if (cropId === item.id) setCropId(null);
    if (backgroundId === item.id) setBackgroundId(null);
    if (layerId === item.id) setLayerId(null);
  }

  function applyProcessedBackground(item: PhotoAsset, blob: Blob, width: number, height: number) {
    resetHistory();
    const processedUrl = URL.createObjectURL(blob);
    objectUrls.current.add(processedUrl);
    setAssets((current) => current.map((asset) => asset.id === item.id
      ? withProcessedImage(asset,{url:processedUrl,width,height}) : asset));
    if (item.processedUrl && canRevokeImageUrl(item.processedUrl,
      assets.filter(asset=>asset.id!==item.id))) {
      objectUrls.current.delete(item.processedUrl);
      URL.revokeObjectURL(item.processedUrl);
    }
    recordStep(makeStep("review.manual", {
      message: "Inspect the manually refined background of any newly imported image.",
    }, "always"));
    setBackgroundId(null);
    setNotice("Processed background applied. Original photo preserved; save project to keep edits.");
  }

  function resetProcessedBackground(item: PhotoAsset) {
    resetHistory();
    setAssets((current) => current.map((asset) => asset.id === item.id
      ? withProcessedImage(asset,null) : asset));
    if (item.processedUrl && canRevokeImageUrl(item.processedUrl,
      assets.filter(asset=>asset.id!==item.id))) {
      objectUrls.current.delete(item.processedUrl);
      URL.revokeObjectURL(item.processedUrl);
    }
    setNotice("Reverted to the original unprocessed background.");
  }

  function savePreset() {
    try {
      const name=presetName.trim();
      if(!name||name.length>80)throw new Error("Enter a preset name (up to 80 characters).");
      const first=assets[0];
      const id=crypto.randomUUID();
      const preset:NamedPreset={id,name,updatedAt:new Date().toISOString(),
        settings:{...settings,manualPlacements:[]},
        itemWidthMm:first?.widthMm??50.8,itemHeightMm:first?.heightMm??50.8,
        quantity:first?.quantity??12};
      const next=[preset,...savedPresets].slice(0,40);
      writePresetLibrary(next);setSavedPresets(next);setSelectedPreset(id);
      setNotice("Named layout saved for future jobs.");
      setError("");
    }catch(cause){setError(displayError(cause));}
  }
  function loadPreset() {
    try{
      const preset=savedPresets.find(p=>p.id===selectedPreset);
      if(!preset)throw new Error("Choose a saved layout first.");
      rememberEdit();
      setSettings({...preset.settings,manualPlacements:[]});
      setAssets(current=>current.map(asset=>({...asset,
        widthMm:preset.itemWidthMm,heightMm:preset.itemHeightMm,
        crop:fitCropToAspect(asset.crop,asset.processedWidth??asset.pixelWidth,
          asset.processedHeight??asset.pixelHeight,preset.itemWidthMm,preset.itemHeightMm),
        quantity:preset.quantity,
      })));
      setNotice("Layout "+preset.name+" applied to this print job.");
      setError("");
    }catch(cause){setError(displayError(cause));}
  }
  function removePreset() {
    if(!selectedPreset||!window.confirm("Delete the selected layout preset?"))return;
    try{
      const next=savedPresets.filter(p=>p.id!==selectedPreset);
      writePresetLibrary(next);setSavedPresets(next);setSelectedPreset("");
      setNotice("Saved layout deleted.");
    }catch(cause){setError(displayError(cause));}
  }

  async function handleCalibration() {
    setError(""); setNotice(""); setExporting(true);
    try {
      const result = await createCalibrationPdf(paper);
      const url = URL.createObjectURL(result);
      const link = document.createElement("a");
      link.href = url;
      link.download = "prints-calibration-" +
        settings.paper.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf";
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice("Calibration sheet ready. Print at 100% Actual Size and measure the 100 mm rulers and 2-inch square.");
    } catch (cause) {
      setError(displayError(cause));
    } finally { setExporting(false); }
  }

  async function handlePngExport(item: PhotoAsset) {
    setError("");setNotice("");setExporting(true);
    try{
      const blob=await exportDesignPng(item,300);
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download=outputPngName(item.name);
      document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      setNotice("Finished PNG downloaded at the target print size and 300 DPI.");
    }catch(cause){setError(displayError(cause));}
    finally{setExporting(false);}
  }
  async function handleExport() {
    if (result.message || selection.error || selection.pages.length===0 || preflight.errors.length>0) {
      setError(selection.error||preflight.errors[0]?.detail||result.message||
        "Resolve print errors before exporting.");
      return;
    }
    setError(""); setNotice(""); setExporting(true);
    try {
      const file = await exportToPdf(selectedAssets,selection.pages,paper,settings.cutGuides,
        rasterizeCrop,settings.trimStyle??"outline",{
          marginMm:settings.marginMm,gapMm:settings.gapMm,
        });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "prints-" + new Date().toISOString().slice(0, 10) +
        (pageRange.trim().toLowerCase()==="all"?"":"-selected-pages")+".pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice(selection.pages.length+" sheet(s) exported. Print at 100% / Actual Size.");
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setExporting(false);
    }
  }

  const updateSetting = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    if(settings[key]===value)return;
    rememberEdit();
    const layoutKeys=["paper","orientation","customWidthMm","customHeightMm",
      "marginMm","gapMm","packing"];
    const reset=layoutKeys.includes(String(key));
    const next={...settings,[key]:value,...(reset?{manualPlacements:[]}:{})};
    setSettings(next);
    recordStep(makeStep("sheet.configure", { ...next }));
  };
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><img src="/mark.svg" className="brand-icon" alt="" />
        <div><strong>PRINTS</strong><small>Print studio</small></div></div>
      <span className="status-pill">Private by design</span>
      <div className="history-tools" role="group" aria-label="Undo and redo">
        <button className="header-icon" disabled={!historyCount.undo} title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo edit" onClick={()=>travel("undo")}>↶</button>
        <button className="header-icon" disabled={!historyCount.redo} title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo edit" onClick={()=>travel("redo")}>↷</button>
      </div>
      <button className="header-icon" onClick={()=>setShowPreferences(p=>!p)}
        aria-label="Preferences" title="Preferences" aria-expanded={showPreferences}>
        <StudioIcon name="settings" size={19}/></button>
      <button className="primary-button" onClick={() => void handleExport()}
        disabled={exporting || selection.pages.length === 0 || !!result.message ||
          !!selection.error || preflight.errors.length>0}>
        <StudioIcon name="download" size={17}/> {exporting ? "Preparing…" : "Export PDF"}
      </button>
    </header>
    {showPreferences&&<PreferencesPanel preferences={userPrefs}
      onClose={()=>setShowPreferences(false)}
      onChange={p=>{try{savePreferences(p);setUserPrefs(p);}
        catch(cause){setError(displayError(cause));}}}/>}
    <div className="workspace" data-mobile-view={mobileView}>
      <aside className="sidebar">
        <div className="panel-heading"><h2>Print setup</h2>
          <HelpTip label="Print setup help" text="Choose your paper and orientation here. Units and defaults can be changed in Preferences."/></div>
        <details className="disclosure-panel"><summary>Projects</summary><section className="panel-section">
          <h3 className="visually-hidden">Saved projects</h3>
          <label>Project name
            <input type="text" maxLength={100} value={projectName}
              onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <button className="primary-button" disabled={projectBusy}
            onClick={() => void saveCurrentProject()}>Save full project</button>
          {projectId&&userPrefs.autoSave!==false&&
            <span className="hint" role="status">Autosave: {
              autoSaveStatus==="saving"?"Saving…":
              autoSaveStatus==="saved"?"Saved":
              autoSaveStatus==="failed"?"Failed — use Save":
              "Waiting for changes"
            }</span>}
          <label>Open an existing project
            <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
              <option value="">Select saved project</option>
              {projectList.map((project) => <option key={project.id} value={project.id}>
                {project.name} ({project.itemCount} images)</option>)}
            </select>
          </label>
          <div className="action-stack">
            <button className="secondary-button" disabled={!selectedProject || projectBusy}
              onClick={() => void openSavedProject()}>Open selected project</button>
            <button className="secondary-button" disabled={!selectedProject || projectBusy}
              onClick={() => void removeSavedProject()}>Delete selected saved project</button>
            <button className="secondary-button" onClick={startNewProject}>New blank project</button>
            <button className="secondary-button" disabled={projectBusy}
              onClick={() => void exportPortableBackup()}>Download portable backup</button>
            <button className="secondary-button" disabled={projectBusy}
              onClick={() => backupInputRef.current?.click()}>Import project backup</button>
            <input ref={backupInputRef} className="visually-hidden" type="file"
              accept=".json,.prints.json,application/json" aria-label="Import PRINTS project backup"
              onChange={handleBackupFile} />
          </div>
          <p className="hint">Projects with source images are stored in this browser. Portable .prints.json backups include original photos, crop settings, masks and layers (up to 48 MiB of image data). Keep backups outside the browser to protect against data loss.</p>
        </section></details>
        <div className="panel-section compact-print">
          <label>Paper
            <select value={settings.paper}
              onChange={(event) => updateSetting("paper", event.target.value as PaperName)}>
              {Object.keys(PAPER_SIZES).map((name) => <option key={name} value={name}>{name}</option>)}
              <option value="Custom">Custom</option>
            </select>
          </label>
          <label>Orientation
            <select value={settings.orientation}
              onChange={(event) => updateSetting("orientation", event.target.value as Orientation)}>
              <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
            </select>
          </label>
          {settings.paper === "Custom" && <div className="two-inputs">
            <DimensionField label="Width" unit={userPrefs.unit} valueMm={settings.customWidthMm}
              onCommit={v=>updateSetting("customWidthMm",v)} />
            <DimensionField label="Height" unit={userPrefs.unit} valueMm={settings.customHeightMm}
              onCommit={v=>updateSetting("customHeightMm",v)} />
          </div>}
          <details className="advanced-options"><summary>Advanced settings</summary>
            <label title="Compact groups compatible sizes to reduce sheet count. Source order preserves item order.">
              Sheet arrangement
              <select value={settings.packing??"compact"} onChange={event=>
                updateSetting("packing",event.target.value as "compact"|"ordered")}>
                <option value="compact">Compact (fewer sheets)</option>
                <option value="ordered">Source order</option>
              </select>
            </label>
            <div className="two-inputs">
              <DimensionField label="Margin" unit={userPrefs.unit} minMm={0}
                valueMm={settings.marginMm} onCommit={v=>updateSetting("marginMm",v)}/>
              <DimensionField label="Gap" unit={userPrefs.unit} minMm={0}
                valueMm={settings.gapMm} onCommit={v=>updateSetting("gapMm",v)}/>
            </div>
            <label className="check-row"><input type="checkbox" checked={settings.cutGuides}
              onChange={(event) => updateSetting("cutGuides", event.target.checked)} /> Cut lines</label>
            {settings.cutGuides&&<label title="Outlines trace each product. Corner marks sit outside the design, in reserved paper whitespace.">
              Cut-mark style
              <select value={settings.trimStyle??"outline"}
                onChange={event=>updateSetting("trimStyle",event.target.value as TrimStyle)}>
                <option value="outline">Product outlines</option>
                <option value="corner">Corner cutting marks</option>
              </select>
            </label>}
            <label title="Export all sheets or enter specific page numbers, such as 1-3,5.">
              Export pages
              <input type="text" value={pageRange} maxLength={80}
                aria-invalid={!!selection.error} onChange={event=>setPageRange(event.target.value)}
                placeholder="all or 1-3,5"/>
            </label>
            {!!selection.error&&<p className="warning" role="alert">{selection.error}</p>}
            <button className="secondary-button" disabled={exporting}
              title="Export a measured reference sheet to test your printer's actual output size."
              onClick={() => void handleCalibration()}>Calibration PDF</button>
          </details>
        </div>
        <details className="disclosure-panel"><summary>Layout presets</summary><div className="panel-section">
          <label>Preset name
            <input type="text" value={presetName} maxLength={80}
              onChange={event=>setPresetName(event.target.value)}/>
          </label>
          <button className="secondary-button" onClick={savePreset}>Save current layout</button>
          <label>Saved layouts
            <select value={selectedPreset} onChange={event=>setSelectedPreset(event.target.value)}>
              <option value="">Select a layout…</option>
              {savedPresets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="action-stack">
            <button disabled={!selectedPreset} className="secondary-button" onClick={loadPreset}>Apply layout</button>
            <button disabled={!selectedPreset} className="secondary-button" onClick={removePreset}>Delete layout</button>
          </div>
        </div></details>
        <details className="disclosure-panel"><summary>Workflows</summary>
        <WorkflowPanel settings={settings} assets={assets}
          recording={recording} recordedSteps={recordedSteps}
          onStartRecording={() => { setRecordedSteps([]); setRecording(true); }}
          onStopRecording={() => setRecording(false)}
          onApply={(newSettings, newAssets, notes) => {
            rememberEdit();
            setSettings({...newSettings,manualPlacements:[]}); setAssets(newAssets.map(a=>({...a,
              crop:fitCropToAspect(a.crop,a.processedWidth??a.pixelWidth,
                a.processedHeight??a.pixelHeight,a.widthMm,a.heightMm)})));
            setNotice("Workflow applied. " + (notes.length ? "Review crops before export: " + notes.join("; ") : "Ready for preview."));
            setError("");
          }}
          onError={setError} /></details>
      </aside>
      <main className="main-content" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <div className="content-heading"><div><h1>Workspace</h1>
          <p>{assets.length?"Preview your print sheets":"Drop images to start a new print"}</p></div>
          <button className="primary-button subtle" onClick={() => inputRef.current?.click()}>
          <StudioIcon name="upload" size={17}/> Add images</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp"
            multiple onChange={handleFileChange} aria-label="Upload image files" />
        </div>
        {error && <p className="banner danger" role="alert">{error}</p>}
        {result.message && <p className="banner danger" role="alert">{result.message}</p>}
        {notice && <p className="banner success" role="status">{notice}</p>}
        {assets.length>0&&<details className="preflight-panel">
          <summary>
            <span>Print check</span>
            <span className={preflight.errors.length?"preflight-error":preflight.warnings.length?"preflight-warning":"preflight-ok"}>
              {preflight.errors.length?preflight.errors.length+" to fix":
               preflight.warnings.length?preflight.warnings.length+" warnings":"Ready"}
            </span>
          </summary>
          <div className="preflight-body">
            {preflight.errors.map((item,i)=><div className="preflight-issue" key={"err-"+item.code+i}>
              <strong>{item.title}</strong><span>{item.detail}</span>
            </div>)}
            {preflight.warnings.map((item,i)=><div className="preflight-issue" key={"warn-"+item.code+i}>
              <strong>{item.title}</strong><span>{item.detail}</span>
            </div>)}
            {!preflight.errors.length&&!preflight.warnings.length&&<p className="hint">
              Layout, crop geometry and image resolution checks passed. Print at 100% / Actual Size.
            </p>}
          </div>
        </details>}
        {layerId && assets.some((asset) => asset.id === layerId) &&
          <LayerPanel key={layerId} item={assets.find((asset) => asset.id === layerId)!}
            previewUrl={previews[layerId]} onChange={updateItem} onClose={() => setLayerId(null)} />}
        {backgroundId && assets.some((asset) => asset.id === backgroundId) &&
          <BackgroundEditor key={backgroundId}
            item={assets.find((asset) => asset.id === backgroundId)!}
            onApply={(blob, width, height) => {
              const asset = assets.find((entry) => entry.id === backgroundId);
              if (asset) applyProcessedBackground(asset, blob, width, height);
            }}
            onReset={() => {
              const asset = assets.find((entry) => entry.id === backgroundId);
              if (asset) resetProcessedBackground(asset);
            }}
            onClose={() => setBackgroundId(null)} />}
        {cropId && assets.some((asset) => asset.id === cropId) &&
          <CropEditor key={cropId} item={assets.find((asset) => asset.id === cropId)!}
            onUpdate={(crop) => {
              const asset = assets.find((entry) => entry.id === cropId);
              if (asset) updateItem({ ...asset, crop });
            }} onClose={() => setCropId(null)} />}
        {assets.length === 0 ? <div className="empty-state" onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter") inputRef.current?.click(); }}
          role="button" tabIndex={0}>
          <div className="empty-icon" aria-hidden="true"><img src="/mark.svg" alt=""/></div>
          <h2>Start with an image</h2>
          <p>Drop a photo here or browse files</p><small>JPG · PNG · WebP</small>
        </div> : <>
          <div className="summary-bar"><span>{assets.length} images</span><span>{totalCopies} copies</span>
            <span>{result.pages.length} sheets</span>
            <span>{formatLength(paper.widthMm,userPrefs.unit)} × {formatLength(paper.heightMm,userPrefs.unit)} {userPrefs.unit}</span></div>
          <nav className="sheet-navigation" aria-label="Preview sheet navigation">
            <button className={"secondary-button"+(arrangeMode?" active-arrange":"")}
              aria-pressed={arrangeMode} title="Drag an individual copy or use arrow keys to change its print position."
              onClick={()=>setArrangeMode(mode=>!mode)}>
              {arrangeMode?"Done arranging":"Arrange copies"}
            </button>
            {arrangeMode&&<button className="secondary-button"
              disabled={!settings.manualPlacements?.length}
              onClick={resetSheetArrangement}>Reset</button>}
            <button className="secondary-button" disabled={safePreviewIndex===0}
              onClick={()=>setPreviewIndex(i=>Math.max(0,i-1))} aria-label="Previous sheet">←</button>
            <span>Sheet {safePreviewIndex+1} of {result.pages.length}</span>
            <button className="secondary-button" disabled={safePreviewIndex>=result.pages.length-1}
              onClick={()=>setPreviewIndex(i=>Math.min(result.pages.length-1,i+1))}
              aria-label="Next sheet">→</button>
            <button className="secondary-button" onClick={()=>setPageRange(String(safePreviewIndex+1))}
              title="Choose just this sheet for PDF export">Export this sheet</button>
          </nav>
          <div className="preview-grid">
            <SheetPreview key={safePreviewIndex} page={result.pages[safePreviewIndex]}
              paper={paper} items={assets} previews={previews}
              guides={settings.cutGuides} trimStyle={settings.trimStyle??"outline"}
              index={safePreviewIndex} arrange={arrangeMode} onMove={moveOnSheet}/>
          </div>
        </>}
        <p className="print-hint">Print at <strong>100% / Actual Size</strong> <HelpTip
          label="Print scaling help" text="Use Actual Size or 100% in your PDF reader. Fit to Page may change physical print dimensions."/></p>
      </main>
      <aside className="items-sidebar">
        <div className="panel-heading"><h2>Images</h2><p>{assets.length}</p></div>
        {assets.length === 0 && <p className="hint padded">Add an image to edit.</p>}
        <div className="asset-list">{assets.map((item) =>
          <AssetCard key={item.id} item={item} unit={userPrefs.unit} onChange={updateItem}
            onCrop={() => { setMobileView("preview");setBackgroundId(null); setLayerId(null); setCropId(item.id); }}
            onBackground={() => { setMobileView("preview");setCropId(null); setLayerId(null); setBackgroundId(item.id); }}
            onLayers={() => { setMobileView("preview");setCropId(null); setBackgroundId(null); setLayerId(item.id); }}
            onDownload={() => void handlePngExport(item)}
            onDuplicate={() => duplicateItem(item)}
            onRemove={() => removeItem(item)} />)}</div>
      </aside>
    </div>
    <nav className="mobile-tabs" aria-label="Mobile workspace navigation">
      <button className={mobileView==="preview"?"active":""} onClick={()=>setMobileView("preview")}>
        <StudioIcon name="preview" size={21}/><span>Preview</span></button>
      <button className={mobileView==="images"?"active":""} onClick={()=>setMobileView("images")}>
        <StudioIcon name="images" size={21}/><span>Images</span></button>
      <button className={mobileView==="print"?"active":""} onClick={()=>setMobileView("print")}>
        <StudioIcon name="print" size={21}/><span>Print</span></button>
    </nav>
  </div>;
}
