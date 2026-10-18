import { useMemo, useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  PAPER_SIZES, composeSheets, getPaperDimensions, pageUtilization, MM_PER_INCH,
} from "./core/layout.ts";
import type { LayoutOptions, Orientation, PaperName, SheetPage } from "./core/layout.ts";
import { exportToPdf } from "./core/exportPdf.ts";
import type { PhotoAsset } from "./core/exportPdf.ts";
import { coverSourceRect, FULL_CROP } from "./core/crop.ts";
import { rasterizeCrop } from "./core/imageRaster.ts";
import {
  createProjectSnapshot, deleteProject, listProjects, loadProject, materializeProject,
  saveProject,
} from "./core/projectStore.ts";
import type { ProjectSettings as Preferences, ProjectSummary } from "./core/projectStore.ts";
import { makeStep, recordSemanticStep } from "./core/workflowEngine.ts";
import type { WorkflowStep } from "./core/workflow.ts";
import CropEditor from "./components/CropEditor.tsx";
import WorkflowPanel from "./components/WorkflowPanel.tsx";


interface LayoutPreset {
  version: 1;
  settings: Preferences;
  itemWidthMm: number;
  itemHeightMm: number;
  quantity: number;
}

const INITIAL: Preferences = {
  paper: "A4",
  orientation: "portrait",
  customWidthMm: 210,
  customHeightMm: 297,
  marginMm: 5,
  gapMm: 3,
  cutGuides: true,
};
const PRESET_STORAGE_KEY = "prints:sheet-preset:v1";
const MAX_FILES = 25;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

async function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("An imported image could not be read."));
    img.src = url;
  });
}

function numberInput(value: number, update: (value: number) => void, min = 0, step = 1) {
  return <input type="number" value={value} min={min} step={step}
    onChange={(event) => update(Number(event.target.value))} />;
}

function AssetCard({ item, onChange, onRemove, onCrop }: {
  item: PhotoAsset;
  onChange: (value: PhotoAsset) => void;
  onRemove: () => void;
  onCrop: () => void;
}) {
  const cropPixels = coverSourceRect(item.pixelWidth, item.pixelHeight, item.crop,
    Math.max(0.1, item.widthMm), Math.max(0.1, item.heightMm), item.focalX, item.focalY);
  const dpi = Math.floor(Math.min(cropPixels.sw / (item.widthMm / MM_PER_INCH),
    cropPixels.sh / (item.heightMm / MM_PER_INCH)));
  return <article className="asset-card">
    <div className="asset-heading">
      <img className="asset-thumbnail" src={item.url} alt="" />
      <div className="asset-name"><strong title={item.name}>{item.name}</strong>
        <small>{item.pixelWidth} × {item.pixelHeight} px</small></div>
      <button className="icon-button" title={"Remove " + item.name} aria-label={"Remove " + item.name} onClick={onRemove}>×</button>
    </div>
    <button className="secondary-button" onClick={onCrop}>Edit crop selection</button>
    <div className="three-inputs">
      <label>Width (mm){numberInput(item.widthMm, (v) => onChange({ ...item, widthMm: v }), 0.1, 0.1)}</label>
      <label>Height (mm){numberInput(item.heightMm, (v) => onChange({ ...item, heightMm: v }), 0.1, 0.1)}</label>
      <label>Copies{numberInput(item.quantity, (v) => onChange({ ...item, quantity: v }), 1, 1)}</label>
    </div>
    <div className="two-inputs">
      <label>Horizontal framing: {item.focalX}%
        <input type="range" min="0" max="100" value={item.focalX}
          onChange={(event) => onChange({ ...item, focalX: Number(event.target.value) })} /></label>
      <label>Vertical framing: {item.focalY}%
        <input type="range" min="0" max="100" value={item.focalY}
          onChange={(event) => onChange({ ...item, focalY: Number(event.target.value) })} /></label>
    </div>
    {Number.isFinite(dpi) && dpi < 150 && <p className="warning">Low resolution: approximately {dpi} DPI at requested size.</p>}
  </article>;
}

function SheetPreview({ page, paper, items, previews, guides, index }: {
  page: SheetPage;
  paper: { widthMm: number; heightMm: number };
  items: ReadonlyArray<PhotoAsset>;
  previews: Record<string, string>;
  guides: boolean;
  index: number;
}) {
  const lookup = new Map(items.map((item) => [item.id, item]));
  return <div className="sheet-wrap">
    <div className="sheet" role="img" aria-label={"Preview of sheet " + (index + 1)}
      style={{ aspectRatio: String(paper.widthMm) + " / " + String(paper.heightMm) }}>
      {page.placements.map((placement) => {
        const item = lookup.get(placement.itemId);
        if (!item) return null;
        return <div key={placement.itemId + "-" + placement.copyIndex} className={"placed" + (guides ? " with-guides" : "")}
          style={{
            left: String(placement.xMm / paper.widthMm * 100) + "%",
            top: String(placement.yMm / paper.heightMm * 100) + "%",
            width: String(placement.widthMm / paper.widthMm * 100) + "%",
            height: String(placement.heightMm / paper.heightMm * 100) + "%",
          }}>
          <img src={previews[item.id] ?? item.url} alt="" draggable={false}
            style={{ objectPosition: previews[item.id] ? "center" : String(item.focalX) + "% " + String(item.focalY) + "%" }} />
        </div>;
      })}
    </div>
    <div className="sheet-caption">Sheet {index + 1} · {page.placements.length} items · {Math.round(pageUtilization(page, {
      paperWidthMm: paper.widthMm, paperHeightMm: paper.heightMm, marginMm: 0, gapMm: 0,
    }) * 100)}% area used</div>
  </div>;
}

export default function App() {
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [settings, setSettings] = useState<Preferences>(INITIAL);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled print job");
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [cropId, setCropId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<WorkflowStep[]>([]);
  const objectUrls = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    void listProjects().then(setProjectList).catch(() => {
      // Browser storage may be disabled; the rest of the editor remains available.
    });
  }, []);

  // The image preview and PDF share exactly the same nondestructive crop rasterizer.
  useEffect(() => {
    let cancelled = false;
    const temporary: string[] = [];
    void Promise.all(assets.map(async (asset): Promise<[string, string]> => {
      const url = URL.createObjectURL(await rasterizeCrop(asset, 120));
      temporary.push(url);
      return [asset.id, url];
    })).then((entries) => {
      if (!cancelled) setPreviews(Object.fromEntries(entries));
    }).catch(() => {
      if (!cancelled) setPreviews({});
    });
    return () => {
      cancelled = true;
      for (const url of temporary) URL.revokeObjectURL(url);
    };
  }, [assets]);

  function recordStep(step: WorkflowStep) {
    if (recording) setRecordedSteps((history) => recordSemanticStep(history, step));
  }

  async function refreshProjectList() {
    setProjectList(await listProjects());
  }

  async function saveCurrentProject() {
    setProjectBusy(true); setError("");
    try {
      const id = projectId ?? crypto.randomUUID();
      await saveProject(await createProjectSnapshot(id, projectName, settings, assets));
      setProjectId(id);
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
      objectUrls.current = new Set(imported.map((asset) => asset.url));
      setAssets(imported);
      setSettings(project.settings);
      setProjectId(project.id);
      setProjectName(project.name);
      setCropId(null);
      setRecordedSteps([]);
      setNotice("Saved project reopened with original source images.");
      for (const url of oldUrls) URL.revokeObjectURL(url);
    } catch (cause) {
      setError(displayError(cause));
    } finally { setProjectBusy(false); }
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
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    setAssets([]); setSettings(INITIAL); setProjectId(null); setProjectName("Untitled print job");
    setSelectedProject(""); setCropId(null); setNotice("New blank project created.");
  }

  const paper = getPaperDimensions(settings.paper, settings.orientation,
    { widthMm: settings.customWidthMm, heightMm: settings.customHeightMm });
  const layoutOptions: LayoutOptions = {
    paperWidthMm: paper.widthMm,
    paperHeightMm: paper.heightMm,
    marginMm: settings.marginMm,
    gapMm: settings.gapMm,
  };
  const result = useMemo(() => {
    try {
      return { pages: composeSheets(assets, layoutOptions), message: "" };
    } catch (cause) {
      return { pages: [] as SheetPage[], message: displayError(cause) };
    }
  }, [assets, paper.widthMm, paper.heightMm, settings.marginMm, settings.gapMm]);
  const totalCopies = assets.reduce((sum, asset) => sum + (Number.isFinite(asset.quantity) ? asset.quantity : 0), 0);

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
        if (file.size > MAX_FILE_BYTES) throw new Error("Each image must be no larger than 25 MB.");
        const url = URL.createObjectURL(file);
        try {
          const dimensions = await imageDimensions(url);
          created.push({
            id: crypto.randomUUID(), name: file.name, url,
            pixelWidth: dimensions.width, pixelHeight: dimensions.height,
            widthMm: 50.8, heightMm: 50.8, quantity: 12, focalX: 50, focalY: 50,
            crop: { ...FULL_CROP },
          });
          objectUrls.current.add(url);
        } catch (cause) {
          URL.revokeObjectURL(url);
          throw cause;
        }
      }
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
    setAssets((current) => current.map((asset) => asset.id === value.id ? value : asset));
    if (!before) return;
    if (before.widthMm !== value.widthMm || before.heightMm !== value.heightMm) {
      recordStep(makeStep("crop.to-size", { widthMm: value.widthMm, heightMm: value.heightMm }));
    }
    if (before.quantity !== value.quantity) recordStep(makeStep("copies.set", { quantity: value.quantity }));
    if (before.focalX !== value.focalX || before.focalY !== value.focalY) {
      recordStep(makeStep("crop.center", { focalX: value.focalX, focalY: value.focalY }, "on-uncertainty"));
    }
    if (JSON.stringify(before.crop) !== JSON.stringify(value.crop)) {
      recordStep(makeStep("review.manual",
        { message: "Inspect the photo-specific crop selection on any replacement image." }, "always"));
    }
  }

  function removeItem(item: PhotoAsset) {
    setAssets((current) => current.filter((asset) => asset.id !== item.id));
    objectUrls.current.delete(item.url);
    URL.revokeObjectURL(item.url);
  }

  function savePreset() {
    const first = assets[0];
    const preset: LayoutPreset = {
      version: 1, settings, itemWidthMm: first?.widthMm ?? 50.8,
      itemHeightMm: first?.heightMm ?? 50.8, quantity: first?.quantity ?? 12,
    };
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
      setNotice("Layout preset saved on this device. Source images are not stored.");
      setError("");
    } catch {
      setError("Local storage is unavailable. The preset could not be saved.");
    }
  }

  function loadPreset() {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) throw new Error("No saved layout preset found on this device.");
      const preset = JSON.parse(raw) as LayoutPreset;
      const s = preset.settings;
      if (preset.version !== 1 || !s || !["A4", "A3", "Letter", "Legal", "Long Bond", "Custom"].includes(s.paper) ||
        !["portrait", "landscape"].includes(s.orientation) || !Number.isFinite(s.marginMm) ||
        s.marginMm < 0 || !Number.isFinite(s.gapMm) || s.gapMm < 0 ||
        !Number.isFinite(s.customWidthMm) || s.customWidthMm <= 0 ||
        !Number.isFinite(s.customHeightMm) || s.customHeightMm <= 0 ||
        typeof s.cutGuides !== "boolean" ||
        !Number.isFinite(preset.itemWidthMm) || preset.itemWidthMm <= 0 ||
        !Number.isFinite(preset.itemHeightMm) || preset.itemHeightMm <= 0 ||
        !Number.isSafeInteger(preset.quantity) || preset.quantity < 1) {
        throw new Error("Saved layout preset is invalid or unsupported.");
      }
      setSettings(s);
      setAssets((current) => current.map((asset) => ({
        ...asset, widthMm: preset.itemWidthMm, heightMm: preset.itemHeightMm, quantity: preset.quantity,
      })));
      setNotice("Saved layout settings applied to the current image(s).");
      setError("");
    } catch (cause) {
      setError(displayError(cause));
    }
  }

  async function handleExport() {
    if (result.message || result.pages.length === 0) return;
    setError(""); setNotice(""); setExporting(true);
    try {
      const file = await exportToPdf(assets, result.pages, paper, settings.cutGuides);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "prints-" + new Date().toISOString().slice(0, 10) + ".pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice("PDF generated. Print at 100% / Actual Size, not Fit to Page.");
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setExporting(false);
    }
  }

  const updateSetting = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    recordStep(makeStep("sheet.configure", { ...next }));
  };
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-icon">P</div>
        <div><strong>PRINTS</strong><small>LOCAL PRINT STUDIO</small></div></div>
      <span className="status-pill">Local-first editing · Projects & workflows</span>
      <button className="primary-button" onClick={() => void handleExport()}
        disabled={exporting || result.pages.length === 0 || !!result.message}>
        {exporting ? "Generating PDF…" : "Export PDF"}
      </button>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="panel-heading"><h2>Print setup</h2><p>Exact physical sizes</p></div>
        <section className="panel-section">
          <h3>Saved projects</h3>
          <label>Project name
            <input type="text" maxLength={100} value={projectName}
              onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <button className="primary-button" disabled={projectBusy}
            onClick={() => void saveCurrentProject()}>Save full project</button>
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
          </div>
          <p className="hint">Original photos and crop settings are saved on this device using IndexedDB. Export backups are still a future enhancement.</p>
        </section>
        <div className="panel-section">
          <label>Paper size
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
            <label>Width (mm){numberInput(settings.customWidthMm, (v) => updateSetting("customWidthMm", v), 1, 0.1)}</label>
            <label>Height (mm){numberInput(settings.customHeightMm, (v) => updateSetting("customHeightMm", v), 1, 0.1)}</label>
          </div>}
          <div className="two-inputs">
            <label>Margin (mm){numberInput(settings.marginMm, (v) => updateSetting("marginMm", v), 0, 0.5)}</label>
            <label>Gap (mm){numberInput(settings.gapMm, (v) => updateSetting("gapMm", v), 0, 0.5)}</label>
          </div>
          <label className="check-row"><input type="checkbox" checked={settings.cutGuides}
            onChange={(event) => updateSetting("cutGuides", event.target.checked)} /> Show trim outlines</label>
        </div>
        <div className="panel-section">
          <h3>Repeat settings</h3>
          <p className="hint">Save and reuse paper, item size, copies and spacing. These are layout presets, not full saved workflows.</p>
          <div className="action-stack">
            <button className="secondary-button" onClick={savePreset}>Save layout preset</button>
            <button className="secondary-button" onClick={loadPreset}>Apply saved preset</button>
          </div>
        </div>
        <WorkflowPanel settings={settings} assets={assets}
          recording={recording} recordedSteps={recordedSteps}
          onStartRecording={() => { setRecordedSteps([]); setRecording(true); }}
          onStopRecording={() => setRecording(false)}
          onApply={(newSettings, newAssets, notes) => {
            setSettings(newSettings); setAssets(newAssets);
            setNotice("Workflow applied. " + (notes.length ? "Review crops before export: " + notes.join("; ") : "Ready for preview."));
            setError("");
          }}
          onError={setError} />
        <div className="panel-section">
          <h3>Upcoming functionality</h3>
          <p className="hint">AI background removal, editable text/shape layers, portable project backups and automated editing stages are still planned.</p>
        </div>
      </aside>
      <main className="main-content" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <div className="content-heading"><div><h1>Sheet composer</h1>
          <p>Upload photos, define quantities and precise dimensions, then preview printable sheets.</p></div>
          <button className="primary-button subtle" onClick={() => inputRef.current?.click()}>+ Add images</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp"
            multiple onChange={handleFileChange} aria-label="Upload image files" />
        </div>
        {error && <p className="banner danger" role="alert">{error}</p>}
        {result.message && <p className="banner danger" role="alert">{result.message}</p>}
        {notice && <p className="banner success" role="status">{notice}</p>}
        {cropId && assets.some((asset) => asset.id === cropId) &&
          <CropEditor key={cropId} item={assets.find((asset) => asset.id === cropId)!}
            onUpdate={(crop) => {
              const asset = assets.find((entry) => entry.id === cropId);
              if (asset) updateItem({ ...asset, crop });
            }} onClose={() => setCropId(null)} />}
        {assets.length === 0 ? <div className="empty-state" onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter") inputRef.current?.click(); }}
          role="button" tabIndex={0}>
          <div className="empty-icon">▧</div><h2>Drop your images here</h2>
          <p>Or click to browse JPG, PNG or WebP. Files stay on this device.</p>
          <small>Up to {MAX_FILES} images · 25 MB each</small>
        </div> : <>
          <div className="summary-bar"><span><strong>{assets.length}</strong> sources</span>
            <span><strong>{totalCopies}</strong> requested copies</span>
            <span><strong>{result.pages.length}</strong> sheets</span>
            <span><strong>{paper.widthMm} × {paper.heightMm} mm</strong> paper</span></div>
          <div className="preview-grid">
            {result.pages.slice(0, 6).map((page, index) =>
              <SheetPreview key={index} page={page} paper={paper} items={assets} previews={previews}
                guides={settings.cutGuides} index={index} />)}
          </div>
          {result.pages.length > 6 && <p className="hint">Showing the first 6 preview sheets; export includes all {result.pages.length} sheets.</p>}
        </>}
        <p className="print-hint">Print exported PDFs at <strong>100% / Actual Size</strong>; printer drivers may otherwise rescale the layout.</p>
      </main>
      <aside className="items-sidebar">
        <div className="panel-heading"><h2>Source images</h2><p>{assets.length} added</p></div>
        {assets.length === 0 && <p className="hint padded">Upload images to edit their print size, quantity and crop framing.</p>}
        <div className="asset-list">{assets.map((item) =>
          <AssetCard key={item.id} item={item} onChange={updateItem}
            onCrop={() => setCropId(item.id)} onRemove={() => removeItem(item)} />)}</div>
      </aside>
    </div>
  </div>;
}
