import { useMemo, useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent,KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  PAPER_SIZES, composeSheets, getPaperDimensions, pageUtilization, MM_PER_INCH,
} from "./core/layout.ts";
import type { LayoutOptions, Orientation, PaperName, SheetPage } from "./core/layout.ts";
import type { PhotoAsset } from "./core/exportPdf.ts";
import { exactCropSourceRect, fitCropToAspect, FULL_CROP } from "./core/crop.ts";
import { assertSafeSourceSize, withProcessedImage } from "./core/assetIntegrity.ts";
import { rasterizeCrop,effectiveRasterDpi } from "./core/imageRaster.ts";
import {cropPreviewKey} from "./core/previewCache.ts";
import {
  createProjectSnapshot, deleteProject, listProjects, loadProject, materializeProject,
  saveProject,beginProjectSave,storedProjectRevision,
  stashDeletedDesign, listTrash, readDeletedDesign, permanentlyDeleteTrash,
  restoreDeletedProject, purgeExpiredTrash,
} from "./core/projectStore.ts";
import type { ProjectSettings as Preferences, ProjectSummary, TrashSummary } from "./core/projectStore.ts";
import { makeStep, recordSemanticStep,reusablePaperParameters } from "./core/workflowEngine.ts";
import type { WorkflowStep } from "./core/workflow.ts";
import CropEditor from "./components/CropEditor.tsx";
import PhotoAdjustEditor from "./components/PhotoAdjustEditor.tsx";
import BackgroundEditor from "./components/BackgroundEditor.tsx";
import LayerPanel from "./components/LayerPanel.tsx";
import WorkflowPanel from "./components/WorkflowPanel.tsx";
import { createProjectArchive, readProjectArchive } from "./core/projectArchive.ts";
import { lookupPrintSize, matchingPrintSizePreset, PRINT_SIZE_PRESETS } from "./core/dimensions.ts";
import { readPreferences,savePreferences,defaultPrintSettings } from "./core/preferences.ts";
import type { UserPreferences } from "./core/preferences.ts";
import { formatLength } from "./core/units.ts";
import DimensionField from "./components/DimensionField.tsx";
import SafeIntegerField from "./components/SafeIntegerField.tsx";
import {parseBoundedNumber} from "./core/safeNumbers.ts";
import PreferencesPanel from "./components/PreferencesPanel.tsx";
import StudioIcon from "./components/StudioIcon.tsx";
import HelpTip from "./components/HelpTip.tsx";
import { DEFAULT_ADJUSTMENTS,mergeGlobalPhotoAdjustments } from "./core/photoAdjustments.ts";
import { exportDesignPng,outputPngName } from "./core/exportPng.ts";
import { exportBatchPngZip } from "./core/batchExport.ts";
import { duplicatePrintDesign } from "./core/duplicateDesign.ts";
import { matchesNamedPreset,readPresetLibrary,writePresetLibrary } from "./core/presetLibrary.ts";
import type { NamedPreset } from "./core/presetLibrary.ts";
import { emptyHistory,pushHistory,travelHistory } from "./core/history.ts";
import {fontCssName,loadLocalFonts} from "./core/fontAssets.ts";
import { referencedImageUrls } from "./core/referencedAssets.ts";
import { WorkspaceEpoch } from "./core/workspaceEpoch.ts";
import { assessPrintJob } from "./core/printPreflight.ts";
import { cornerCutLines } from "./core/cutMarks.ts";
import { selectPages } from "./core/pageSelection.ts";
import { applyManualPlacements,moveManualPlacement } from "./core/manualLayout.ts";

import type { TrimStyle } from "./core/cutMarks.ts";
import type { History } from "./core/history.ts";
import {readAppRoute,recordAppNavigation} from "./core/appNavigation.ts";
import type {AppRoute,WorkspaceView,EditorView} from "./core/appNavigation.ts";


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

function AssetCard({ item, unit, onChange, onRemove, onAdjust, onCrop, onBackground, onLayers, onDownload, onDuplicate }: {
  item: PhotoAsset;
  unit: UserPreferences["unit"];
  onChange: (value: PhotoAsset) => void;
  onRemove: () => void;
  onAdjust: () => void;
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
  const sizePreset = matchingPrintSizePreset(item.widthMm,item.heightMm);
  return <article className="asset-card">
    <div className="asset-heading">
      <img className="asset-thumbnail" src={item.processedUrl ?? item.url} alt="" />
      <div className="asset-name"><strong title={item.name}>{item.name}</strong>
        <small>{item.pixelWidth} × {item.pixelHeight} px</small></div>
      <button className="icon-button" title={"Remove " + item.name} aria-label={"Remove " + item.name} onClick={onRemove}><StudioIcon name="close" size={17}/></button>
    </div>
    <div className="two-inputs">
      <button className="primary-button" onClick={onAdjust}><StudioIcon name="edit" size={16}/>Edit photo</button>
      <button className="secondary-button" onClick={onCrop}><StudioIcon name="crop" size={16}/>Crop</button>
      <button className="secondary-button" onClick={onBackground}><StudioIcon name="background" size={16}/>Background</button>
      <button className="secondary-button" onClick={onLayers}><StudioIcon name="layers" size={16}/>Layers ({item.layers?.length ?? 0})</button>
    </div>
    <label title="Use a common size or enter an exact dimension below.">Size preset
      <select value={sizePreset ?? ""} onChange={(event) => {
        if (!event.target.value) return;
        const size = lookupPrintSize(event.target.value);
        onChange({ ...item, ...size });
      }}>
        <option value="">Custom size</option>
        {PRINT_SIZE_PRESETS.map((preset) =>
          <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
    </label>
    <div className="three-inputs">
      <DimensionField label="Width" unit={unit} valueMm={item.widthMm}
        onCommit={v=>onChange({...item,widthMm:v})}/>
      <DimensionField label="Height" unit={unit} valueMm={item.heightMm}
        onCommit={v=>onChange({...item,heightMm:v})}/>
      <SafeIntegerField label="Copies" value={item.quantity} min={1} max={1000}
        onCommit={v=>onChange({...item,quantity:v})}/>
    </div>
    <div className="two-inputs">
      <button className="secondary-button" onClick={onDuplicate}
        title="Create another independently cropped design from this same original image">
        <StudioIcon name="duplicate" size={16}/>Duplicate design</button>
      <button className="secondary-button" title="Download the cropped image with text, shapes and photo adjustments"
        onClick={onDownload}><StudioIcon name="download" size={16}/>Download PNG</button>
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
        const xMm=moving&&draft?draft.xMm:placement.xMm;
        const yMm=moving&&draft?draft.yMm:placement.yMm;
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
              fontFamily:layer.kind==="text"?fontCssName(layer):undefined,
              whiteSpace:layer.kind==="text"?"pre":undefined,
              textAlign:layer.kind==="text"?layer.align??"left":undefined,
              lineHeight:layer.kind==="text"?layer.lineHeightFactor??1.2:undefined,
              WebkitTextStroke:layer.kind==="text"&&layer.outlinePt?
                String(layer.outlinePt)+"px "+(layer.outlineColor??"#ffffff"):undefined,
              textShadow:layer.kind==="text"&&layer.shadowPt?
                String(layer.shadowPt)+"px "+String(layer.shadowPt)+"px "+(layer.shadowColor??"#333333"):undefined,
            }}>{layer.kind === "text" ? layer.text : null}</div>)}
        </div>;
      })}
      {guides && trimStyle==="corner" && <svg className="corner-cut-overlay"
        aria-hidden="true" viewBox={"0 0 "+paper.widthMm+" "+paper.heightMm}
        preserveAspectRatio="none">
        {page.placements.flatMap((p)=>{
          const moved=draft?.id===p.itemId&&draft.copy===p.copyIndex;
          const positioned=moved&&draft?{...p,xMm:draft.xMm,yMm:draft.yMm}:p;
          return cornerCutLines(positioned);
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
  const workspaceEpoch=useRef(new WorkspaceEpoch());
  const [historyCount,setHistoryCount]=useState({undo:0,redo:0});
  const [userPrefs,setUserPrefs]=useState<UserPreferences>(readPreferences);
  const [savedPresets,setSavedPresets]=useState<NamedPreset[]>(readPresetLibrary);
  const [presetName,setPresetName]=useState("My print layout");
  const [selectedPreset,setSelectedPreset]=useState("");
  const [settings, setSettings] = useState<Preferences>(()=>defaultPrintSettings(readPreferences()));
  const liveAssets = useRef(assets);
  const liveSettings = useRef(settings);
  liveAssets.current = assets;
  liveSettings.current = settings;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [batchProgress,setBatchProgress]=useState<{finished:number;total:number}|null>(null);
  const batchController=useRef<AbortController|null>(null);
  const [previewIndex,setPreviewIndex]=useState(0);
  const [pageRange,setPageRange]=useState("all");
  const [arrangeMode,setArrangeMode]=useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled print job");
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [trashList, setTrashList] = useState<TrashSummary[]>([]);
  const deletingDesigns = useRef(new Set<string>());
  const [selectedProject, setSelectedProject] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [autoSaveStatus,setAutoSaveStatus]=useState<"idle"|"saving"|"saved"|"failed">("idle");
  const saveSequence=useRef(0);
  const savedRevision=useRef<{id:string;token:string}|null>(null);
  const tabSaveSession=useRef(crypto.randomUUID());

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewCache=useRef(new Map<string,{key:string;url:string}>());
  const [route,setRoute]=useState<AppRoute>(()=>readAppRoute(
    typeof window==="undefined"?"/preview":window.location.href));
  const routeRef=useRef(route);
  const mobileView=route.view;
  const cropId=route.editor==="crop"?route.assetId??null:null;
  const backgroundId=route.editor==="background"?route.assetId??null:null;
  const layerId=route.editor==="layers"?route.assetId??null:null;
  const adjustId=route.editor==="adjust"?route.assetId??null:null;
  const showPreferences=route.preferences===true;
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<WorkflowStep[]>([]);
  const objectUrls = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Keep browser history and React's visible view synchronized, including
  // Android Back and desktop browser Back/Forward. Editor history is separate
  // from undo/redo of print data.
  useEffect(()=>{
    const pop=()=>{
      const next=readAppRoute(window.location.href);
      routeRef.current=next;
      setRoute(next);
    };
    window.addEventListener("popstate",pop);
    return()=>window.removeEventListener("popstate",pop);
  },[]);
  function navigate(next:AppRoute,replaceHistory=false){
    if(!recordAppNavigation(window.history,routeRef.current,next,replaceHistory))return;
    routeRef.current=next;
    setRoute(next);
  }
  function navigateView(view:WorkspaceView){navigate({view});}
  function openEditor(editor:EditorView,id:string){
    navigate({view:"preview",editor,assetId:id});
  }
  function closeOverlay(){
    const current=routeRef.current;
    if(!current.editor&&!current.preferences)return;
    if((Number(window.history.state?.printsDepth)||0)>0){
      window.history.back();
    }else{
      navigate({view:current.view},true);
    }
  }
  function resetWorkspaceRoute(){navigate({view:"preview"},true);}

  function historyChanged() {
    setHistoryCount({undo:history.current.undo.length,redo:history.current.redo.length});
  }
  function resetHistory() {
    workspaceEpoch.current.advance();
    history.current=emptyHistory<Snapshot>();historyChanged();
  }
  function rememberEdit(items=liveAssets.current,print=liveSettings.current) {
    workspaceEpoch.current.advance();
    history.current=pushHistory(history.current,{items,print},50);
    historyChanged();
  }
  function travel(direction:"undo"|"redo") {
    const next=travelHistory(history.current,{
      items:liveAssets.current,print:liveSettings.current},direction);
    if(!next)return;
    workspaceEpoch.current.advance();
    history.current=next.history;
    liveAssets.current=next.value.items;
    liveSettings.current=next.value.print;
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

  // Blob URLs remain live while ANY undo/redo snapshot references them.
  // Release only after an edit falls out of the bounded history and is not
  // present in the current workspace. Durable trash stores its own Blobs.
  useEffect(() => {
    const referenced = referencedImageUrls(assets,
      [...history.current.undo, ...history.current.redo]);
    for (const url of objectUrls.current) {
      if (!referenced.has(url)) {
        URL.revokeObjectURL(url);
        objectUrls.current.delete(url);
      }
    }
  }, [assets, historyCount]);

  useEffect(() => {
    void listProjects().then(setProjectList).catch(() => {
      // Browser storage may be disabled; the rest of the editor remains available.
    });
    void purgeExpiredTrash().then(() => listTrash()).then(setTrashList).catch(() => {
      // Recovery storage errors are surfaced when a user tries to delete.
    });
  }, []);

  // Only re-rasterize source images whose visible crop or photo adjustments
  // changed. Quantity, sheet positioning and vector layers reuse existing PNGs.
  const previewSignature=JSON.stringify(assets.map(cropPreviewKey));
  useEffect(()=>{void loadLocalFonts(assets.flatMap(asset=>asset.layers??[])).catch(cause=>
    setError("Some custom fonts could not be loaded: "+displayError(cause)));},[assets]);
  useEffect(()=>{
    let cancelled=false;
    const keyById=new Map(assets.map(asset=>[asset.id,cropPreviewKey(asset)]));
    for(const [id,old] of previewCache.current){
      if(keyById.get(id)!==old.key){
        URL.revokeObjectURL(old.url);
        previewCache.current.delete(id);
      }
    }
    setPreviews(Object.fromEntries(
      [...previewCache.current].map(([id,entry])=>[id,entry.url])));
    void (async()=>{
      for(const asset of assets){
        if(cancelled)return;
        const key=cropPreviewKey(asset);
        if(previewCache.current.get(asset.id)?.key===key)continue;
        const blob=await rasterizeCrop(asset,120);
        // The effect's cleanup may run while decoding/cropping is in progress.
        if(cancelled)return;
        const url=URL.createObjectURL(blob);
        const old=previewCache.current.get(asset.id);
        if(old)URL.revokeObjectURL(old.url);
        previewCache.current.set(asset.id,{key,url});
        setPreviews(current=>({...current,[asset.id]:url}));
      }
    })().catch((cause:unknown)=>{
      if(!cancelled)setError("Preview failed: "+displayError(cause));
    });
    return()=>{cancelled=true;};
  // previewSignature describes only raster-affecting asset inputs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[previewSignature]);

  useEffect(()=>()=> {
    for(const value of previewCache.current.values())URL.revokeObjectURL(value.url);
    previewCache.current.clear();
  },[]);

  function recordStep(step: WorkflowStep) {
    if (recording) setRecordedSteps((history) => recordSemanticStep(history, step));
  }

  // Local autosave is debounced and uses generation fencing: an earlier job
  // cannot overwrite a newer project after the user switches workspaces.
  useEffect(()=>{
    const generation=++saveSequence.current;
    if(!projectId)return;
    // Invalidate snapshots at edit time, not ten seconds later.
    // This also guards manual Save when autosave is disabled.
    const revision=beginProjectSave(projectId);
    setAutoSaveStatus("idle");
    if(userPrefs.autoSave===false)return;
    const timer=window.setTimeout(()=>{
      void (async()=>{
        if(generation!==saveSequence.current)return;
        setAutoSaveStatus("saving");
        try{
          const snapshot=await createProjectSnapshot(projectId,projectName,settings,assets);
          if(generation!==saveSequence.current)return;
          const expected=savedRevision.current?.id===projectId?savedRevision.current.token:null;
          const stored=await saveProject(snapshot,revision,expected,tabSaveSession.current);
          if(stored)savedRevision.current={id:projectId,token:storedProjectRevision(snapshot)};
          if(generation===saveSequence.current){
            setAutoSaveStatus(stored?"saved":"idle");
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
  async function refreshTrashList() {
    setTrashList(await listTrash());
  }

  async function restoreFromTrash(entry:TrashSummary) {
    if (projectBusy) return;
    setProjectBusy(true); setError("");
    try {
      if (entry.kind === "project") {
        const restored = await restoreDeletedProject(entry.id);
        await refreshProjectList();
        setSelectedProject(restored.id);
        setNotice("Recovered "+restored.name+". Select Open to continue editing.");
      } else {
        const origin=workspaceEpoch.current.capture();
        if (liveAssets.current.length >= MAX_FILES)
          throw new Error("Remove another design or start a new job before restoring; the workspace supports 25 designs.");
        if (liveAssets.current.some(asset=>asset.id === entry.assetId))
          throw new Error("This design is already present in the current job.");
        const stored = await readDeletedDesign(entry.id);
        if (!workspaceEpoch.current.current(origin))
          throw new Error("Workspace changed while loading recovery. Retry in the intended project.");
        const project = {schemaVersion:1 as const,id:crypto.randomUUID(),
          name:"Recovered design",updatedAt:new Date().toISOString(),
          settings:liveSettings.current,assets:[stored]};
        let [restored] = materializeProject(project);
        if (liveAssets.current.some(asset=>asset.id === restored.id))
          restored={...restored,id:crypto.randomUUID()};
        objectUrls.current.add(restored.url);
        if (restored.processedUrl) objectUrls.current.add(restored.processedUrl);
        const next=[...liveAssets.current,restored];
        rememberEdit(liveAssets.current,liveSettings.current);
        liveAssets.current=next;
        liveSettings.current={...liveSettings.current,manualPlacements:[]};
        setAssets(next);
        setSettings(liveSettings.current);
        setNotice("Recovered "+restored.name+" with its original image, crop, adjustments and layers.");
      }
      await refreshTrashList();
    } catch (cause) {
      setError("Recovery failed: "+displayError(cause));
    } finally {setProjectBusy(false);}
  }

  async function deleteTrashPermanently(entry:TrashSummary) {
    if (!window.confirm("Permanently erase the recovery copy of "+entry.name+"? This cannot be undone.")) return;
    setProjectBusy(true); setError("");
    try {
      await permanentlyDeleteTrash(entry.id);
      await refreshTrashList();
      setNotice("Recovery copy permanently deleted.");
    } catch (cause) {
      setError(displayError(cause));
    } finally {setProjectBusy(false);}
  }

  async function saveCurrentProject() {
    const origin=workspaceEpoch.current.capture();
    setProjectBusy(true); setError("");
    try {
      const id=projectId??crypto.randomUUID();
      const revision=beginProjectSave(id);
      const snapshot=await createProjectSnapshot(id,projectName,settings,assets);
      // Reading a source Blob is asynchronous. A changed workspace must not
      // persist an obsolete snapshot, even if it is not allowed to bind to UI.
      if(!workspaceEpoch.current.current(origin)){
        setNotice("The print job changed during saving. Save again to include the latest edits.");
        return;
      }
      const expected=savedRevision.current?.id===id?savedRevision.current.token:null;
      const stored=await saveProject(snapshot,revision,expected,tabSaveSession.current);
      if(!workspaceEpoch.current.current(origin)) {
        // An older manual save must never associate an entirely different
        // workspace with its project ID or clobber its current revision token.
        return;
      }
      if(!stored){
        setNotice("A newer save is pending. Current edits remain available.");
        return;
      }
      savedRevision.current={id,token:storedProjectRevision(snapshot)};
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
    const origin=workspaceEpoch.current.capture();
    if (assets.length > 0 && !window.confirm(
      "Opening another saved project will replace the current workspace. Save any unsaved edits first. Continue?")) return;
    setProjectBusy(true); setError("");
    try {
      const project = await loadProject(selectedProject);
      if (!workspaceEpoch.current.current(origin))
        throw new Error("Workspace changed during opening. Reopen the project.");
      const imported = materializeProject(project);
      const oldUrls = [...objectUrls.current];
      objectUrls.current = new Set(imported.flatMap((asset) =>
        [asset.url, ...(asset.processedUrl ? [asset.processedUrl] : [])]));
      resetHistory();
      setAssets(imported);
      setSettings(project.settings);
      setSelectedPreset("");
      savedRevision.current={id:project.id,token:storedProjectRevision(project)};
      setProjectId(project.id);
      setAutoSaveStatus("saved");
      setProjectName(project.name);
      resetWorkspaceRoute();
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
    const origin=workspaceEpoch.current.capture();
    if (assets.length > 0 && !window.confirm(
      "Importing will replace the current workspace. Save any unsaved work first. Continue?")) return;
    setProjectBusy(true); setError("");
    try {
      const imported = await readProjectArchive(file);
      if (!workspaceEpoch.current.current(origin))
        throw new Error("Workspace changed during backup import. Import again.");
      if(!await saveProject(imported))throw new Error("Imported project was superseded before saving.");
      if (!workspaceEpoch.current.current(origin))
        throw new Error("Workspace changed while saving the imported backup. Open the saved import manually.");
      const materialized = materializeProject(imported);
      const oldUrls = [...objectUrls.current];
      objectUrls.current = new Set(materialized.flatMap((asset) =>
        [asset.url, ...(asset.processedUrl ? [asset.processedUrl] : [])]));
      resetHistory();
      setAssets(materialized);
      setSettings(imported.settings);
      setSelectedPreset("");
      savedRevision.current={id:imported.id,token:storedProjectRevision(imported)};
      setProjectId(imported.id);
      setAutoSaveStatus("saved");
      setProjectName(imported.name);
      setSelectedProject(imported.id);
      resetWorkspaceRoute();
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
      const expected=projectId===selectedProject && savedRevision.current?.id===selectedProject
        ? savedRevision.current.token
        : projectList.find(p=>p.id===selectedProject)?.revision;
      if(!expected)throw new Error("Project list is out of date. Refresh or reopen before deleting.");
      await deleteProject(selectedProject,expected);
      if (projectId === selectedProject) {
        savedRevision.current=null;
        setProjectId(null);
      }
      setSelectedProject("");
      await refreshProjectList();
      await refreshTrashList();
      setNotice("Saved project moved to Recently Deleted. The current workspace remains open.");
    } catch (cause) {
      setError(displayError(cause));
      await refreshProjectList().catch(()=>{});
    }
    finally { setProjectBusy(false); }
  }

  function startNewProject() {
    if(assets.length>0 && !window.confirm("Start a new print job? Save or download a backup before discarding unsaved changes."))return;
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    resetHistory();
    savedRevision.current=null;
    setAssets([]); setSettings(defaultPrintSettings(userPrefs)); setProjectId(null);
    setSelectedPreset("");
    setAutoSaveStatus("idle"); setProjectName("Untitled print job");
    setSelectedProject(""); resetWorkspaceRoute();
    setNotice("New blank project created.");
  }

  const visibleTrash=trashList.filter(entry=>entry.kind==="project"||
    !assets.some(asset=>asset.id===entry.assetId));
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
  const matchingLayout = savedPresets.find(p=>matchesNamedPreset(p,settings,assets));
  const presetDropdownId = selectedPreset || matchingLayout?.id || "";
  const chosenLayout = savedPresets.find(p=>p.id===presetDropdownId);
  const chosenLayoutApplied = !!chosenLayout && matchesNamedPreset(chosenLayout,settings,assets);

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
    const origin=workspaceEpoch.current.capture();
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
      if(!workspaceEpoch.current.current(origin))
        throw new Error("The workspace changed while loading images. Reimport into the current job.");
      if(liveAssets.current.length + created.length > MAX_FILES)
        throw new Error("This job supports at most 25 designs. The import was canceled safely.");
      const next=[...liveAssets.current,...created];
      rememberEdit(liveAssets.current,liveSettings.current);
      liveAssets.current=next;
      liveSettings.current={...liveSettings.current,manualPlacements:[]};
      setSettings(liveSettings.current);
      setAssets(next);
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
    if(parseBoundedNumber(String(value.widthMm),0.000001,2000)===null||
       parseBoundedNumber(String(value.heightMm),0.000001,2000)===null||
       parseBoundedNumber(String(value.quantity),1,1000,true)===null){
      setError("Width and height must be positive, and copies must be a whole number from 1 to 1,000.");
      return;
    }
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
    if(JSON.stringify(before.adjustments)!==JSON.stringify(value.adjustments)){
      const values={...DEFAULT_ADJUSTMENTS,...value.adjustments};
      // Source-specific retouch points never replay onto another person's image.
      const portable=(Object.fromEntries(Object.entries(values)
        .filter(([key,field])=>key!=="regions"&&field!==undefined))) as
          Record<string,string|number|boolean|null>;
      recordStep(makeStep("image.adjust",portable));
      if(JSON.stringify(before.adjustments?.regions)!==JSON.stringify(value.adjustments?.regions))
        recordStep(makeStep("review.manual",{
          message:"Local retouches are crop-specific. Inspect and reapply brushes to each replacement image.",
        },"always"));
    }
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
    rememberEdit();
    setAssets(current=>[...current,duplicated]);
    setSettings(old=>({...old,manualPlacements:[]}));
    setNotice("Design duplicated. Set a different crop, size or quantity without reimporting.");
  }

  async function removeItem(item: PhotoAsset) {
    if (deletingDesigns.current.has(item.id)) return;
    const origin=workspaceEpoch.current.capture();
    deletingDesigns.current.add(item.id);
    setError("");
    try {
      // Commit no visible deletion until we have a persistent recovery copy.
      const snapshot=await createProjectSnapshot(crypto.randomUUID(),
        projectName.trim()||"Untitled print job",liveSettings.current,[item]);
      if (!workspaceEpoch.current.current(origin))
        throw new Error("The workspace changed while preparing deletion. Retry the removal.");
      const trashId=await stashDeletedDesign(snapshot.assets[0],projectId,projectName);
      const current=liveAssets.current;
      const latest=current.find(asset=>asset.id===item.id);
      if (!latest) {
        await refreshTrashList();
        return;
      }
      if (!workspaceEpoch.current.current(origin) || latest !== item) {
        await permanentlyDeleteTrash(trashId);
        throw new Error("The workspace or design changed during deletion. Retry the removal.");
      }
      rememberEdit(current,liveSettings.current);
      const remaining=current.filter(asset=>asset.id!==item.id);
      liveAssets.current=remaining;
      liveSettings.current={...liveSettings.current,manualPlacements:[]};
      setAssets(remaining);
      setSettings(liveSettings.current);
      // Shared and historic object URLs are released by the history-aware
      // lifecycle effect only after their final reference disappears.
      if (routeRef.current.assetId===item.id) resetWorkspaceRoute();
      await refreshTrashList();
      setNotice(item.name+" moved to Recently Deleted. Use Undo to restore it.");
    } catch (cause) {
      setError("Image not deleted: "+displayError(cause));
    } finally {
      deletingDesigns.current.delete(item.id);
    }
  }

  function applyProcessedBackground(item: PhotoAsset, blob: Blob, width: number, height: number) {
    rememberEdit();
    const processedUrl = URL.createObjectURL(blob);
    objectUrls.current.add(processedUrl);
    setAssets((current) => current.map((asset) => asset.id === item.id
      ? withProcessedImage(asset,{url:processedUrl,width,height}) : asset));
    recordStep(makeStep("review.manual", {
      message: "Inspect the manually refined background of any newly imported image.",
    }, "always"));
    closeOverlay();
    setNotice("Processed background applied. Original photo preserved; save project to keep edits.");
  }

  function resetProcessedBackground(item: PhotoAsset) {
    rememberEdit();
    setAssets((current) => current.map((asset) => asset.id === item.id
      ? withProcessedImage(asset,null) : asset));
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
      const preset=savedPresets.find(p=>p.id===presetDropdownId);
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
    if(!presetDropdownId||!window.confirm("Delete the selected layout preset?"))return;
    try{
      const next=savedPresets.filter(p=>p.id!==presetDropdownId);
      writePresetLibrary(next);setSavedPresets(next);setSelectedPreset("");
      setNotice("Saved layout deleted.");
    }catch(cause){setError(displayError(cause));}
  }

  async function handleCalibration() {
    setError(""); setNotice(""); setExporting(true);
    try {
      const {createCalibrationPdf}=await import("./core/calibration.ts");
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

  async function handleBatchExport(){
    if(batchController.current||!assets.length)return;
    setError("");setNotice("");
    const controller=new AbortController();
    batchController.current=controller;
    setBatchProgress({finished:0,total:assets.length});
    try{
      const zip=await exportBatchPngZip(assets,{
        signal:controller.signal,
        onProgress:(finished,total)=>setBatchProgress({finished,total}),
      });
      const url=URL.createObjectURL(zip);
      const link=document.createElement("a");
      link.href=url;link.download="prints-designs-"+new Date().toISOString().slice(0,10)+".zip";
      document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      setNotice("Downloaded "+assets.length+" finished designs as PNG files.");
    }catch(cause){
      const message=displayError(cause);
      if(controller.signal.aborted)setNotice("Batch export canceled.");
      else setError(message);
    }finally{
      if(batchController.current===controller)batchController.current=null;
      setBatchProgress(null);
    }
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
      setNotice("Finished PNG downloaded at the target print size, approximately "+
        effectiveRasterDpi(item.widthMm,item.heightMm,300)+" effective DPI.");
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
      const {exportToPdf}=await import("./core/exportPdf.ts");
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
    if(typeof value==="number"){
      const dimension=key==="customWidthMm"||key==="customHeightMm";
      const minimum=dimension?0.000001:0;
      if(parseBoundedNumber(String(value),minimum,dimension?2000:1999.999)===null){
        setError(dimension?"Custom paper dimensions must be greater than zero and no larger than 2000 mm.":
          "Paper margins and spacing must be between 0 and 2000 mm.");
        return;
      }
    }
    if(settings[key]===value)return;
    rememberEdit();
    const layoutKeys=["paper","orientation","customWidthMm","customHeightMm",
      "marginMm","gapMm","packing"];
    const reset=layoutKeys.includes(String(key));
    const next={...settings,[key]:value,...(reset?{manualPlacements:[]}:{})};
    setSettings(next);
    recordStep(makeStep("sheet.configure", reusablePaperParameters(next)));
  };
  const editingPhoto=adjustId?assets.find(asset=>asset.id===adjustId):undefined;
  if(editingPhoto)return <PhotoAdjustEditor key={editingPhoto.id} item={editingPhoto}
    onCancel={closeOverlay}
    onApply={adjustments=>{
      updateItem({...editingPhoto,adjustments});
      closeOverlay();
    }}
    onApplyAll={adjustments=>{
      rememberEdit();
      setAssets(current=>current.map(asset=>{
        return {...asset,adjustments:mergeGlobalPhotoAdjustments(asset.adjustments,adjustments??DEFAULT_ADJUSTMENTS)};
      }));
      setNotice("Global photo edits applied to the batch. Review each crop and local retouches before printing.");
      closeOverlay();
    }}/>;
  const editingLayers=layerId?assets.find(asset=>asset.id===layerId):undefined;
  if(editingLayers)return <main className="layers-editor-route" aria-label="Design layers editor">
    <LayerPanel key={editingLayers.id} item={editingLayers}
      previewUrl={previews[editingLayers.id]} onChange={updateItem} onClose={closeOverlay}/>
  </main>;
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><img src="/wordmark.svg" className="brand-wordmark" alt="PRINTS" width="765" height="230" />
        <small>Print studio</small></div>
      <span className="status-pill">Private by design</span>
      <div className="history-tools" role="group" aria-label="Undo and redo">
        <button className="header-icon" disabled={!historyCount.undo} title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo edit" onClick={()=>travel("undo")}><StudioIcon name="undo" size={18}/></button>
        <button className="header-icon" disabled={!historyCount.redo} title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo edit" onClick={()=>travel("redo")}><StudioIcon name="redo" size={18}/></button>
      </div>
      <button className="header-icon" onClick={()=>showPreferences?closeOverlay():navigate({...routeRef.current,editor:undefined,assetId:undefined,preferences:true})}
        aria-label="Preferences" title="Preferences" aria-expanded={showPreferences}>
        <StudioIcon name="settings" size={19}/></button>
      <button className="primary-button" onClick={() => void handleExport()}
        disabled={exporting || selection.pages.length === 0 || !!result.message ||
          !!selection.error || preflight.errors.length>0}>
        <StudioIcon name="download" size={17}/> {exporting ? "Preparing…" : "Export PDF"}
      </button>
    </header>
    {showPreferences&&<PreferencesPanel preferences={userPrefs}
      onClose={closeOverlay}
      onChange={p=>{try{savePreferences(p);setUserPrefs(p);}
        catch(cause){setError(displayError(cause));}}}/>}
    <div className="workspace" data-mobile-view={mobileView}>
      <aside className="sidebar">
        <div className="panel-heading"><h2 className="panel-title-with-icon"><StudioIcon name="print" size={18}/><span>Print setup</span></h2>
          <HelpTip label="Print setup help" text="Choose your paper and orientation here. Units and defaults can be changed in Preferences."/></div>
        <div className="panel-section compact-print">
          <label className="print-field"><span className="field-label"><StudioIcon name="paper" size={15}/>Paper</span>
            <select value={settings.paper}
              onChange={(event) => updateSetting("paper", event.target.value as PaperName)}>
              {Object.keys(PAPER_SIZES).map((name) => <option key={name} value={name}>{name}</option>)}
              <option value="Custom">Custom</option>
            </select>
          </label>
          <label className="print-field"><span className="field-label"><StudioIcon name={settings.orientation==="portrait"?"portrait":"orientation"} size={15}/>Orientation</span>
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
          <details className="advanced-options"><summary><span className="disclosure-label"><StudioIcon name="advanced" size={17}/><span>Advanced settings</span></span><StudioIcon name="chevron" size={16} className="disclosure-chevron"/></summary>
            <label title="Compact groups compatible sizes to reduce sheet count. Source order preserves item order.">
              Sheet arrangement
              <select value={settings.packing??"compact"} onChange={event=>
                updateSetting("packing",event.target.value as "compact"|"ordered")}>
                <option value="compact">Compact (fewer sheets)</option>
                <option value="ordered">Source order</option>
              </select>
            </label>
            <div className="two-inputs">
              <DimensionField label="Margin" unit={userPrefs.unit} minMm={0} maxMm={1999.999}
                valueMm={settings.marginMm} onCommit={v=>updateSetting("marginMm",v)}/>
              <DimensionField label="Gap" unit={userPrefs.unit} minMm={0} maxMm={1999.999}
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
              onClick={() => void handleCalibration()}><StudioIcon name="ruler" size={16}/>Calibration PDF</button>
          </details>
        </div>
        <details className="disclosure-panel"><summary><span className="disclosure-label"><StudioIcon name="presets" size={17}/><span>Layout presets</span><small className="selection-summary">{matchingLayout?.name ?? (chosenLayout?"Custom / modified":"Custom")}</small></span><StudioIcon name="chevron" size={16} className="disclosure-chevron"/></summary><div className="panel-section">
          <label>Preset name
            <input type="text" value={presetName} maxLength={80}
              onChange={event=>setPresetName(event.target.value)}/>
          </label>
          <button className="secondary-button" onClick={savePreset}><StudioIcon name="save" size={16}/>Save current layout</button>
          <label>Saved layouts
            <select value={presetDropdownId} onChange={event=>setSelectedPreset(event.target.value)}>
              <option value="">Select a layout…</option>
              {savedPresets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <p className="hint" role="status">{chosenLayout ?
            (chosenLayoutApplied ? "Applied layout: " + chosenLayout.name : "Selected layout: " + chosenLayout.name + " (not applied or modified)" +
              (matchingLayout ? ". Current layout: " + matchingLayout.name : "")) :
            "Custom layout — no saved preset applied."}</p>
          <div className="action-stack">
            <button disabled={!presetDropdownId} className="secondary-button" onClick={loadPreset}><StudioIcon name="apply" size={16}/>Apply layout</button>
            <button disabled={!presetDropdownId} className="secondary-button" onClick={removePreset}><StudioIcon name="delete" size={16}/>Delete layout</button>
          </div>
        </div></details>
        <details className="disclosure-panel"><summary><span className="disclosure-label"><StudioIcon name="workflows" size={17}/><span>Workflows</span></span><StudioIcon name="chevron" size={16} className="disclosure-chevron"/></summary>
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
        <details className="disclosure-panel"><summary><span className="disclosure-label"><StudioIcon name="projects" size={17}/><span>Projects</span></span><StudioIcon name="chevron" size={16} className="disclosure-chevron"/></summary><section className="panel-section">
          <h3 className="visually-hidden">Saved projects</h3>
          <label>Project name
            <input type="text" maxLength={100} value={projectName}
              onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <button className="primary-button" disabled={projectBusy}
            onClick={() => void saveCurrentProject()}><StudioIcon name="save" size={16}/>Save full project</button>
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
            <button className="secondary-button" disabled={projectBusy}
              onClick={() => void refreshProjectList().catch(cause=>setError(displayError(cause)))}>
              <StudioIcon name="refresh" size={16}/>Refresh saved projects
            </button>
            <button className="secondary-button" disabled={!selectedProject || projectBusy}
              onClick={() => void openSavedProject()}><StudioIcon name="open" size={16}/>Open selected project</button>
            <button className="secondary-button" disabled={!selectedProject || projectBusy}
              onClick={() => void removeSavedProject()}><StudioIcon name="delete" size={16}/>Delete selected saved project</button>
            <button className="secondary-button" onClick={startNewProject}><StudioIcon name="new" size={16}/>New blank project</button>
            <details className="disclosure-panel">
              <summary><span className="disclosure-label"><StudioIcon name="delete" size={16}/>
                <span>Recently Deleted ({visibleTrash.length})</span></span>
                <StudioIcon name="chevron" size={16} className="disclosure-chevron"/></summary>
              <section className="panel-section">
                <p className="hint">Recovery copies stay on this device for up to 30 days.
                  Clearing browser storage can remove them sooner. Download backups for long-term safety.</p>
                {visibleTrash.length===0?<p className="hint">No recoverable deletions.</p>:
                  visibleTrash.map(entry=><div className="recovery-item" key={entry.id}>
                    <span><strong>{entry.name}</strong>
                      <small>{entry.kind==="project"?"Saved project":"Image / design"} · {new Date(entry.deletedAt).toLocaleDateString()}</small></span>
                    <div className="recovery-actions">
                      <button className="secondary-button" disabled={projectBusy}
                        onClick={()=>void restoreFromTrash(entry)}>Restore</button>
                      <button className="secondary-button" disabled={projectBusy}
                        aria-label={"Delete recovery copy of "+entry.name+" permanently"}
                        onClick={()=>void deleteTrashPermanently(entry)}>Delete permanently</button>
                    </div>
                  </div>)}
              </section>
            </details>

            <button className="secondary-button" disabled={projectBusy}
              onClick={() => void exportPortableBackup()}><StudioIcon name="download" size={16}/>Download portable backup</button>
            <button className="secondary-button" disabled={projectBusy}
              onClick={() => backupInputRef.current?.click()}><StudioIcon name="import" size={16}/>Import project backup</button>
            <input ref={backupInputRef} className="visually-hidden" type="file"
              accept=".json,.prints.json,application/json" aria-label="Import PRINTS project backup"
              onChange={handleBackupFile} />
          </div>
          <p className="hint">Projects with source images are stored in this browser. Portable .prints.json backups include original photos, crop settings, masks and layers (up to 48 MiB of image data). Keep backups outside the browser to protect against data loss.</p>
        </section></details>
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
            <span className="disclosure-label"><StudioIcon name="preflight" size={17}/><span>Print check</span></span>
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
            onClose={closeOverlay} />}
        {cropId && assets.some((asset) => asset.id === cropId) &&
          <CropEditor key={cropId} item={assets.find((asset) => asset.id === cropId)!}
            onUpdate={(crop) => {
              const asset = assets.find((entry) => entry.id === cropId);
              if (asset) updateItem({ ...asset, crop });
            }} onClose={closeOverlay} />}
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
          {result.pages.length>0 ? <>
          <nav className="sheet-navigation" aria-label="Preview sheet navigation">
            <button className={"secondary-button"+(arrangeMode?" active-arrange":"")}
              aria-pressed={arrangeMode} title="Drag an individual copy or use arrow keys to change its print position."
              onClick={()=>setArrangeMode(mode=>!mode)}>
              <StudioIcon name="arrange" size={16}/>{arrangeMode?"Done arranging":"Arrange copies"}
            </button>
            {arrangeMode&&<button className="secondary-button"
              disabled={!settings.manualPlacements?.length}
              onClick={resetSheetArrangement}><StudioIcon name="reset" size={16}/>Reset</button>}
            <button className="secondary-button" disabled={safePreviewIndex===0}
              onClick={()=>setPreviewIndex(i=>Math.max(0,i-1))} aria-label="Previous sheet"><StudioIcon name="left" size={17}/></button>
            <span>Sheet {safePreviewIndex+1} of {result.pages.length}</span>
            <button className="secondary-button" disabled={safePreviewIndex>=result.pages.length-1}
              onClick={()=>setPreviewIndex(i=>Math.min(result.pages.length-1,i+1))}
              aria-label="Next sheet"><StudioIcon name="right" size={17}/></button>
            <button className="secondary-button" onClick={()=>setPageRange(String(safePreviewIndex+1))}
              title="Choose just this sheet for PDF export">Export this sheet</button>
          </nav>
          <div className="preview-grid">
            <SheetPreview key={safePreviewIndex} page={result.pages[safePreviewIndex]}
              paper={paper} items={assets} previews={previews}
              guides={settings.cutGuides} trimStyle={settings.trimStyle??"outline"}
              index={safePreviewIndex} arrange={arrangeMode} onMove={moveOnSheet}/>
          </div>
          </> : <p className="banner danger" role="status">
            No printable sheets are available. Check image dimensions, copy counts and paper settings.
          </p>}
        </>}
        <p className="print-hint">Print at <strong>100% / Actual Size</strong> <HelpTip
          label="Print scaling help" text="Use Actual Size or 100% in your PDF reader. Fit to Page may change physical print dimensions."/></p>
      </main>
      <aside className="items-sidebar">
        <div className="panel-heading"><h2 className="panel-title-with-icon"><StudioIcon name="images" size={18}/><span>Images</span></h2><p>{assets.length}</p></div>
        {assets.length>0&&<div className="batch-actions">
          <button className="secondary-button" disabled={!!batchProgress||exporting}
            title="Export one finished PNG per design, using up to 300 DPI subject to browser raster memory limits."
            onClick={()=>void handleBatchExport()}><StudioIcon name="download" size={16}/>Export all designs (ZIP)</button>
          {batchProgress&&<>
            <span className="hint" role="status">
              {batchProgress.finished}/{batchProgress.total} designs
            </span>
            <button className="secondary-button" onClick={()=>batchController.current?.abort()}>
              Cancel</button>
          </>}
        </div>}
        {assets.length === 0 && <p className="hint padded">Add an image to edit.</p>}
        <div className="asset-list">{assets.map((item) =>
          <AssetCard key={item.id} item={item} unit={userPrefs.unit} onChange={updateItem}
            onAdjust={() => openEditor("adjust",item.id)}
            onCrop={() => openEditor("crop",item.id)}
            onBackground={() => openEditor("background",item.id)}
            onLayers={() => openEditor("layers",item.id)}
            onDownload={() => void handlePngExport(item)}
            onDuplicate={() => duplicateItem(item)}
            onRemove={() => void removeItem(item)} />)}</div>
      </aside>
    </div>
    <nav className="mobile-tabs" aria-label="Mobile workspace navigation">
      <button className={mobileView==="preview"?"active":""} onClick={()=>navigateView("preview")}>
        <StudioIcon name="preview" size={21}/><span>Preview</span></button>
      <button className={mobileView==="images"?"active":""} onClick={()=>navigateView("images")}>
        <StudioIcon name="images" size={21}/><span>Images</span></button>
      <button className={mobileView==="print"?"active":""} onClick={()=>navigateView("print")}>
        <StudioIcon name="print" size={21}/><span>Print</span></button>
    </nav>
  </div>;
}
