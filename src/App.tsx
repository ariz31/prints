import { useMemo, useRef, useState, useEffect } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  PAPER_SIZES, composeSheets, getPaperDimensions, pageUtilization, MM_PER_INCH,
} from "./core/layout.ts";
import type { LayoutOptions, Orientation, PaperName, SheetPage } from "./core/layout.ts";
import { exportToPdf } from "./core/exportPdf.ts";
import type { PhotoAsset } from "./core/exportPdf.ts";

interface Preferences {
  paper: PaperName;
  orientation: Orientation;
  customWidthMm: number;
  customHeightMm: number;
  marginMm: number;
  gapMm: number;
  cutGuides: boolean;
}

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

function AssetCard({ item, onChange, onRemove }: {
  item: PhotoAsset;
  onChange: (value: PhotoAsset) => void;
  onRemove: () => void;
}) {
  const dpi = Math.floor(Math.min(item.pixelWidth / (item.widthMm / MM_PER_INCH),
    item.pixelHeight / (item.heightMm / MM_PER_INCH)));
  return <article className="asset-card">
    <div className="asset-heading">
      <img className="asset-thumbnail" src={item.url} alt="" />
      <div className="asset-name"><strong title={item.name}>{item.name}</strong>
        <small>{item.pixelWidth} × {item.pixelHeight} px</small></div>
      <button className="icon-button" title={"Remove " + item.name} aria-label={"Remove " + item.name} onClick={onRemove}>×</button>
    </div>
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

function SheetPreview({ page, paper, items, guides, index }: {
  page: SheetPage;
  paper: { widthMm: number; heightMm: number };
  items: ReadonlyArray<PhotoAsset>;
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
          <img src={item.url} alt="" draggable={false}
            style={{ objectPosition: String(item.focalX) + "% " + String(item.focalY) + "%" }} />
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
  const objectUrls = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
  }, []);

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
    setAssets((current) => current.map((asset) => asset.id === value.id ? value : asset));
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
    setSettings((current) => ({ ...current, [key]: value }));
  };
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-icon">P</div>
        <div><strong>PRINTS</strong><small>LOCAL PRINT STUDIO</small></div></div>
      <span className="status-pill">Foundation release · Local processing</span>
      <button className="primary-button" onClick={() => void handleExport()}
        disabled={exporting || result.pages.length === 0 || !!result.message}>
        {exporting ? "Generating PDF…" : "Export PDF"}
      </button>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="panel-heading"><h2>Print setup</h2><p>Exact physical sizes</p></div>
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
        <div className="panel-section">
          <h3>Product roadmap</h3>
          <p className="hint">Layer editing, manual/recorded workflows, background removal, batch AI and durable project saving are planned, not yet functional.</p>
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
              <SheetPreview key={index} page={page} paper={paper} items={assets}
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
          <AssetCard key={item.id} item={item} onChange={updateItem} onRemove={() => removeItem(item)} />)}</div>
      </aside>
    </div>
  </div>;
}
