import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import type { ProjectSettings as Preferences } from "../../domain/models/project.ts";
import type { SheetPage, TrimStyle } from "../../domain/models/sheet.ts";
import type { PrintModeConfig, PrintModeJob } from "../../domain/models/printMode.ts";
import { PRINT_MODES } from "../../domain/models/printMode.ts";
import { createPrintModeJob, getModePaperDimensions } from "../../features/print-modes/logic/printModes.ts";
import { inspectModeImageCoverage } from "../../features/print-modes/logic/printModeAssignments.ts";
import type { TrimLine } from "../../domain/geometry/cutMarks.ts";
import {
  composeSheets,
  getPaperDimensions,
  type LayoutOptions,
} from "../../features/sheet-composer/logic/layout.ts";
import {
  moveManualPlacement,
  rotateManualPlacement,
} from "../../features/sheet-composer/logic/manualLayout.ts";
import {
  notepadGrid,
  notepadCutLines,
  type CutGrid,
} from "../../features/sheet-composer/logic/notepadLayout.ts";
import { composeNotepadSheets } from "../../features/sheet-composer/logic/notepadLayout.ts";
import { applyManualPlacements } from "../../features/sheet-composer/logic/manualLayout.ts";
import { selectPages } from "../../features/sheet-composer/logic/pageSelection.ts";
import { resolveOutputDpi } from "../../platform/rendering/dpi.ts";
import {
  cropPreviewKey,
  processPreviewQueue,
  previewSourceStatus,
} from "../../platform/rendering/previewCache.ts";
import {
  rasterizeCrop,
  rasterizeCropPreview,
} from "../../platform/rendering/imageRaster.ts";
import { assessPrintJob } from "../../domain/validation/printPreflight.ts";
import type { PreflightReport } from "../../domain/validation/printPreflight.ts";
import { exportBatchPngZip } from "../../features/exports/logic/batchExport.ts";
import { exportDesignPng, outputPngName } from "../../features/exports/logic/exportPng.ts";
import { releasePhotoBlobUrl } from "../../platform/storage/photoBlobRegistry.ts";
import { loadLocalFonts } from "../../platform/fonts/fontAssets.ts";
import { LruCache } from "../../shared/utils/lruCache.ts";

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export type ModeImageCoverage = ReturnType<typeof inspectModeImageCoverage>;

export interface WorkspaceControllerOptions {
  assets: PhotoAsset[];
  settings: Preferences;
  onUpdateSetting: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onSetSettings: Dispatch<SetStateAction<Preferences>>;
  rememberEdit: (items?: PhotoAsset[], print?: Preferences) => void;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
}

export interface WorkspaceControllerState {
  paper: { widthMm: number; heightMm: number };
  modeConfig: PrintModeConfig | null;
  modeJob: PrintModeJob | null;
  modeCoverage: ModeImageCoverage | undefined;
  modeAssets: PhotoAsset[];
  modeLabel: string;
  totalCopies: number;
  outputDpi: number;
  notepadInfo: CutGrid | null;
  notepadCuts: readonly TrimLine[] | undefined;
  result: { pages: SheetPage[]; automatic: SheetPage[]; message: string };

  // Viewport & Selection
  previewIndex: number;
  safePreviewIndex: number;
  previewExpanded: boolean;
  pageRange: string;
  selection: { pages: SheetPage[]; error: string };
  selectedAssets: PhotoAsset[];
  pageCoverage: ModeImageCoverage | undefined;
  arrangeMode: boolean;

  // Raster previews & preflight
  previews: Record<string, string>;
  previewFailures: Record<string, { key: string; message: string }>;
  modePreviews: Record<string, string>;
  modeRasterErrors: Record<string, { key: string; message: string }>;
  preflight: PreflightReport;
  printCheckRef: RefObject<HTMLDetailsElement | null>;

  // Export
  showExport: boolean;
  exportTarget: { format: "pdf" | "png" | "zip"; id?: string };
  exporting: boolean;
  pdfProgress: { completed: number; total: number } | null;
  pngProgress: { completed: number; total: number } | null;
  batchProgress: { finished: number; total: number } | null;
}

export interface WorkspaceControllerActions {
  setPreviewIndex: Dispatch<SetStateAction<number>>;
  setPreviewExpanded: Dispatch<SetStateAction<boolean>>;
  setPageRange: Dispatch<SetStateAction<string>>;
  setArrangeMode: Dispatch<SetStateAction<boolean>>;
  setShowExport: Dispatch<SetStateAction<boolean>>;
  setExportTarget: Dispatch<SetStateAction<{ format: "pdf" | "png" | "zip"; id?: string }>>;

  moveOnSheet: (itemId: string, copyIndex: number, xMm: number, yMm: number) => void;
  rotateOnSheet: (itemId: string, copyIndex: number) => void;
  resetSheetArrangement: () => void;

  retryFailedPreviews: () => void;
  retryModePreviews: () => void;

  cancelExports: () => void;
  handleExport: () => Promise<void>;
  handlePngExport: (item: PhotoAsset) => Promise<void>;
  handleBatchExport: () => Promise<void>;
  handleCalibration: () => Promise<void>;
}

export type WorkspaceController = WorkspaceControllerState & WorkspaceControllerActions;

export function useWorkspaceController(options: WorkspaceControllerOptions): WorkspaceController {
  const { assets, settings, onSetSettings, rememberEdit, setError, setNotice } = options;

  const [showExport, setShowExport] = useState(false);
  const [exportTarget, setExportTarget] = useState<{ format: "pdf" | "png" | "zip"; id?: string }>({ format: "pdf" });
  const [pngProgress, setPngProgress] = useState<{ completed: number; total: number } | null>(null);
  const pngController = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ completed: number; total: number } | null>(null);
  const pdfController = useRef<AbortController | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ finished: number; total: number } | null>(null);
  const batchController = useRef<AbortController | null>(null);

  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [pageRange, setPageRange] = useState("all");
  const [arrangeMode, setArrangeMode] = useState(false);

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [previewFailures, setPreviewFailures] = useState<Record<string, { key: string; message: string }>>({});
  const [previewRetry, setPreviewRetry] = useState(0);
  const previewCache = useRef(new LruCache<string, { key: string; url: string }>({
    maxCapacity: 32,
    onEvict: (_id, entry) => releasePhotoBlobUrl(entry.url),
  }));

  const modeRasterCache = useRef(new LruCache<string, { key: string; url: string }>({
    maxCapacity: 32,
    onEvict: (_id, entry) => URL.revokeObjectURL(entry.url),
  }));
  const [modeRasterRevision, setModeRasterRevision] = useState(0);
  const [modePreviewRetry, setModePreviewRetry] = useState(0);
  const [modeRasterErrors, setModeRasterErrors] = useState<Record<string, { key: string; message: string }>>({});

  const printCheckRef = useRef<HTMLDetailsElement | null>(null);

  const cancelExports = useCallback(() => {
    pdfController.current?.abort();
    pngController.current?.abort();
    batchController.current?.abort();
  }, []);

  useEffect(() => () => {
    pdfController.current?.abort();
    pngController.current?.abort();
    batchController.current?.abort();
  }, []);

  // Escape key for previewExpanded
  useEffect(() => {
    if (!previewExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if(event.key==="Escape")setPreviewExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewExpanded]);

  // Outside click & Escape for preflight panel
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!printCheckRef.current?.open) return;
      if (event.target instanceof Node && !printCheckRef.current.contains(event.target)) {
        printCheckRef.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && printCheckRef.current?.open) {
        printCheckRef.current.open = false;
      }
    };
    document.addEventListener("pointerdown",closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const modeConfig = settings.printModeConfig ?? null;
  const outputDpi=resolveOutputDpi(modeConfig?.dpi,settings.pdfDpi);

  const modeComputation=useMemo(() => {
    if (!modeConfig) return { job: null, error: "" };
    try {
      return { job: createPrintModeJob(assets,modeConfig), error: "" };
    } catch (cause) {
      return { job: null, error: displayError(cause) };
    }
  }, [assets, modeConfig]);

  const modeJob = modeComputation.job;

  const modeCoverage = useMemo(
    () => (modeConfig && modeJob ? inspectModeImageCoverage(assets, modeConfig, modeJob) : undefined),
    [assets, modeConfig, modeJob]
  );

  const modeAssets = modeConfig ? modeJob?.assets ?? [] : assets;

  const paper = useMemo(
    () =>
      modeConfig
        ? getModePaperDimensions(modeConfig)
        : getPaperDimensions(settings.paper, settings.orientation, {
            widthMm: settings.customWidthMm,
            heightMm: settings.customHeightMm,
          }),
    [modeConfig, settings.paper, settings.orientation, settings.customWidthMm, settings.customHeightMm]
  );

  const modeLabel = modeConfig ? PRINT_MODES.find(m => m.id === modeConfig.mode)?.label ?? "" : "";

  const notepadInfo = useMemo(() => {
    try {
      return settings.notepadPreset
        ? notepadGrid(settings.notepadPreset, paper, settings.orientation, settings.marginMm)
        : null;
    } catch {
      return null;
    }
  }, [settings.notepadPreset, settings.orientation, settings.marginMm, paper]);

  const notepadCuts = useMemo(() => {
    try {
      return settings.notepadPreset
        ? notepadCutLines(settings.notepadPreset, paper, settings.orientation, settings.marginMm)
        : undefined;
    } catch {
      return undefined;
    }
  }, [settings.notepadPreset, settings.orientation, settings.marginMm, paper]);

  const layoutOptions: LayoutOptions = useMemo(
    () => ({
      paperWidthMm: paper.widthMm,
      paperHeightMm: paper.heightMm,
      marginMm: settings.marginMm,
      gapMm: settings.gapMm,
      packing: settings.packing ?? "compact",
      autoRotate: settings.autoRotate ?? false,
    }),
    [paper.widthMm, paper.heightMm, settings.marginMm, settings.gapMm, settings.packing, settings.autoRotate]
  );

  const result = useMemo(() => {
    if (modeConfig) {
      const pages = modeJob?.pages ?? [];
      return { pages, automatic: pages, message: modeComputation.error };
    }
    try {
      const automatic = settings.notepadPreset
        ? composeNotepadSheets(assets, settings.notepadPreset, paper, settings.orientation, settings.marginMm)
        : composeSheets(
            assets.map((asset: PhotoAsset) => ({
              ...asset,
              canRotate: !(asset.layers ?? []).some(layer => layer.visible),
            })),
            layoutOptions
          );
      return {
        pages: settings.notepadPreset
          ? automatic
          : applyManualPlacements(automatic, settings.manualPlacements ?? [], layoutOptions),
        automatic,
        message: "",
      };
    } catch (cause) {
      return { pages: [] as SheetPage[], automatic: [] as SheetPage[], message: displayError(cause) };
    }
  }, [
    modeConfig,
    modeJob,
    modeComputation.error,
    assets,
    paper,
    settings.marginMm,
    settings.manualPlacements,
    settings.notepadPreset,
    settings.orientation,
    layoutOptions,
  ]);

  const totalCopies = modeConfig
    ? modeJob?.total ?? modeConfig.quantity
    : assets.reduce((sum: number, asset: PhotoAsset) => sum + (Number.isFinite(asset.quantity) ? asset.quantity : 0), 0);

  // Classic preview raster queue
  const previewSignature = JSON.stringify(assets.map(cropPreviewKey));

  useEffect(() => {
    void loadLocalFonts(assets.flatMap((asset: PhotoAsset) => asset.layers ?? [])).catch(cause =>
      setError("Some custom fonts could not be loaded: " + displayError(cause))
    );
  }, [assets, setError]);

  useEffect(() => {
    let cancelled = false;
    const keyById = new Map(assets.map((asset: PhotoAsset) => [asset.id, cropPreviewKey(asset)]));
    for (const [id, old] of previewCache.current.entries()) {
      if (keyById.get(id) !== old.key) {
        previewCache.current.delete(id);
      }
    }
    setPreviews(Object.fromEntries([...previewCache.current.entries()].map(([id, entry]) => [id, entry.url])));

    void processPreviewQueue(assets,async asset=>{
        const key = cropPreviewKey(asset);
        if (previewCache.current.get(asset.id)?.key === key) return;
        const blob = await rasterizeCropPreview(asset);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        previewCache.current.set(asset.id, { key, url });
        setPreviews(Object.fromEntries([...previewCache.current.entries()].map(([id, entry]) => [id, entry.url])));
        setPreviewFailures(current => {
          if (current[asset.id]?.key !== key) return current;
          const next = { ...current };
          delete next[asset.id];
          return next;
        });
      },
      (asset: PhotoAsset, cause: unknown) => {
        setPreviewFailures(current => ({
          ...current,
          [asset.id]: {
            key: cropPreviewKey(asset),
            message: displayError(cause),
          },
        }));
        setError(
          "Preview failed for " +
            asset.name +
            ": " +
            displayError(cause) +
            ". Other images remain available. Reimport or restore this photo."
        );
      },
      () => cancelled
    );

    return () => {
      cancelled = true;
    };
  }, [previewSignature, previewRetry, assets, setError]);

  useEffect(() => () => {
    previewCache.current.clear();
  }, []);

  // Mode raster preview queue
  useEffect(() => {
    let canceled = false;
    const active = modeConfig ? modeAssets : [];
    const keys = new Map(active.map((a: PhotoAsset) => [a.id, cropPreviewKey(a)]));
    for (const [id, cached] of modeRasterCache.current.entries()) {
      if (keys.get(id) !== cached.key) {
        modeRasterCache.current.delete(id);
      }
    }
    void (async () => {
      for (const asset of active) {
        if (canceled) return;
        const key = cropPreviewKey(asset);
        if (modeRasterCache.current.get(asset.id)?.key === key) continue;
        try {
          const blob = await rasterizeCropPreview(asset);
          if (canceled || keys.get(asset.id) !== key) return;
          const url = URL.createObjectURL(blob);
          modeRasterCache.current.set(asset.id, { key, url });
          setModeRasterErrors(prev => {
            if (prev[asset.id]?.key !== key) return prev;
            const next = { ...prev };
            delete next[asset.id];
            return next;
          });
          setModeRasterRevision(x => x + 1);
        } catch (cause) {
          if (canceled) return;
          setModeRasterErrors(prev => ({ ...prev, [asset.id]: { key, message: displayError(cause) } }));
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [modeConfig, modeAssets, modePreviewRetry]);

  useEffect(() => () => {
    modeRasterCache.current.clear();
  }, []);

  const modePreviews = useMemo(() => {
    const output: Record<string, string> = {};
    for (const a of modeAssets) {
      const cached = modeRasterCache.current.get(a.id);
      if (cached?.key === cropPreviewKey(a)) output[a.id] = cached.url;
    }
    return output;
  }, [modeAssets, modeRasterRevision]);

  const safePreviewIndex = Math.min(previewIndex, Math.max(0, result.pages.length - 1));

  const selection = useMemo(() => {
    try {
      const indices = selectPages(pageRange, result.pages.length);
      return { pages: indices.map(i => result.pages[i]), error: "" };
    } catch (cause) {
      return { pages: [] as SheetPage[], error: displayError(cause) };
    }
  }, [result.pages, pageRange]);

  const selectedAssetIds = useMemo(
    () => new Set(selection.pages.flatMap((page: SheetPage) => page.placements.map(placement => placement.itemId))),
    [selection.pages]
  );

  const selectedAssets = useMemo(
    () => {
      const selectedAssets=modeAssets.filter((asset: PhotoAsset) => selectedAssetIds.has(asset.id));
      return selectedAssets;
    },
    [modeAssets, selectedAssetIds]
  );

  const pageCoverage = useMemo(
    () => {
      const pageCoverage=modeConfig&&selection.pages.length ? inspectModeImageCoverage(assets, modeConfig, { pages: selection.pages }) : undefined;
      return pageCoverage;
    },
    [assets, modeConfig, selection.pages]
  );

  const preflight: PreflightReport = useMemo(() => {
    const trim = modeConfig
      ? {
          cutGuides: modeConfig.cutGuides,
          trimStyle: "outline" as const,
          marginMm: modeConfig.marginMm,
          gapMm: modeConfig.gapMm,
          ...(modeConfig.mode === "notepad" ? { notepadPreset: modeConfig.grid } : {}),
          ...(modeJob?.cuts?{notepadCuts:modeJob.cuts}:{}),
        }
      : settings;
    const base = assessPrintJob(selectedAssets, selection.pages, paper, trim, outputDpi);
    const sourceErrors = selectedAssets.flatMap((asset: PhotoAsset) => {
      const status = modeConfig
        ? modeRasterErrors[asset.id]?.key === cropPreviewKey(asset)
          ? { kind: "failed" as const, message: modeRasterErrors[asset.id].message }
          : modePreviews[asset.id]
          ? { kind: "ready" as const }
          : { kind: "pending" as const }
        : previewSourceStatus(asset, previewCache.current.get(asset.id), previews[asset.id], previewFailures[asset.id]);
      if (status.kind === "ready") return [];
      return [
        {
          severity: "error" as const,
          code: status.kind === "failed" ? "image-source-unavailable" : "image-source-pending",
          title: status.kind === "failed" ? "Photo could not be rendered" : "Checking image source",
          detail:
            status.kind === "failed"
              ? asset.name + ": " + status.message + ". Restore or reimport this photo."
              : asset.name + ": wait for the preview to render before exporting.",
          assetId: asset.id,
        },
      ];
    });
    const omission = modeCoverage?.unintended ?? [];
    const coverageWarning = omission.length
      ? [
          {
            severity: "warning" as const,
            code: "mode-image-coverage",
            title: "Some imported designs are not printed",
            detail:
              omission.length +
              " selected design(s) received no printed copies. Increase Finished pieces or switch to Copies per design.",
          },
        ]
      : [];
    return {
      ...base,
      errors: [...base.errors, ...sourceErrors],
      warnings: [...base.warnings, ...coverageWarning],
    };
  }, [
    modeConfig,
    modeCoverage,
    modePreviews,
    modeRasterErrors,
    outputDpi,
    paper,
    previewFailures,
    previews,
    selectedAssets,
    selection.pages,
    settings,
  ]);

  // Manual placement actions
  const moveOnSheet = useCallback(
    (itemId: string, copyIndex: number, xMm: number, yMm: number) => {
      try {
        const next = moveManualPlacement(
          result.automatic,
          settings.manualPlacements ?? [],
          layoutOptions,
          safePreviewIndex,
          itemId,
          copyIndex,
          xMm,
          yMm
        );
        rememberEdit();
        onSetSettings((old: Preferences) => ({ ...old, manualPlacements: next }));
        setError("");
        setNotice("Copy position updated. PDF export uses the same coordinates.");
      } catch (cause) {
        setError(displayError(cause));
      }
    },
    [layoutOptions, onSetSettings, rememberEdit, result.automatic, safePreviewIndex, setError, setNotice, settings.manualPlacements]
  );

  const rotateOnSheet = useCallback(
    (itemId: string, copyIndex: number) => {
      if ((assets.find(a => a.id === itemId)?.layers ?? []).some(l => l.visible)) {
        setError("Rotate photo-only designs, or hide their design layers first.");
        return;
      }
      try {
        const next = rotateManualPlacement(
          result.automatic,
          settings.manualPlacements ?? [],
          layoutOptions,
          safePreviewIndex,
          itemId,
          copyIndex
        );
        rememberEdit();
        onSetSettings((old: Preferences) => ({ ...old, manualPlacements: next }));
        setError("");
        setNotice("Copy rotated 90°. Crop and physical size are preserved.");
      } catch (cause) {
        setError(displayError(cause));
      }
    },
    [assets, layoutOptions, onSetSettings, rememberEdit, result.automatic, safePreviewIndex, setError, setNotice, settings.manualPlacements]
  );

  const resetSheetArrangement = useCallback(() => {
    if (!settings.manualPlacements?.length) return;
    rememberEdit();
    onSetSettings((old: Preferences) => ({ ...old, manualPlacements: [] }));
    setError("");
    setNotice("Automatic arrangement restored.");
  }, [onSetSettings, rememberEdit, setError, setNotice, settings.manualPlacements?.length]);

  const retryFailedPreviews = useCallback(() => {
    setPreviewRetry(r => r + 1);
  }, []);

  const retryModePreviews = useCallback(() => {
    setModePreviewRetry(r => r + 1);
  }, []);

  // Export handlers
  const handleCalibration = useCallback(async () => {
    setError("");
    setNotice("");
    setExporting(true);
    try {
      const { createCalibrationPdf } = await import("../../domain/validation/calibration.ts");
      const calibResult = await createCalibrationPdf(paper);
      const url = URL.createObjectURL(calibResult);
      const link = document.createElement("a");
      link.href = url;
      link.download = "prints-calibration-" + settings.paper.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => releasePhotoBlobUrl(url), 60000);
      setNotice("Calibration sheet ready. Print at 100% Actual Size and measure the 100 mm rulers and 2-inch square.");
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setExporting(false);
    }
  }, [paper, setError, setNotice, settings.paper]);

  const handleBatchExport = useCallback(async () => {
    if (batchController.current || pdfController.current || pngController.current || exporting || !modeAssets.length) {
      return;
    }
    setError("");
    setNotice("");
    const controller = new AbortController();
    batchController.current = controller;
    setBatchProgress({ finished: 0, total: modeAssets.length });
    try {
      const zip=await exportBatchPngZip(modeAssets,{
        dpi: outputDpi,
        signal: controller.signal,
        onProgress: (finished: number, total: number) => setBatchProgress({ finished, total }),
      });
      const url = URL.createObjectURL(zip);
      const link = document.createElement("a");
      link.href = url;
      link.download = "prints-designs-" + new Date().toISOString().slice(0, 10) + ".zip";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => releasePhotoBlobUrl(url), 30000);
      setNotice("Downloaded " + modeAssets.length + " finished designs as PNG files at " + outputDpi + " DPI.");
    } catch (cause) {
      const message = displayError(cause);
      if (controller.signal.aborted) setNotice("Batch export canceled.");
      else setError(message);
    } finally {
      if (batchController.current === controller) batchController.current = null;
      setBatchProgress(null);
    }
  }, [exporting, modeAssets, outputDpi, setError, setNotice]);

  const handlePngExport = useCallback(
    async (item: PhotoAsset) => {
      if (exporting || pngController.current || batchController.current || pdfController.current) return;
      const outputItem = modeConfig ? modeAssets.find((asset: PhotoAsset) => asset.id === item.id) : item;
      if (!outputItem) {
        setError("This design is not included in the selected Print Mode.");
        return;
      }
      const controller = new AbortController();
      pngController.current = controller;
      setError("");
      setNotice("");
      setExporting(true);
      setPngProgress({ completed: 0, total: 1 });
      try {
        const blob=await exportDesignPng(outputItem,outputDpi,{
          signal: controller.signal,
          onProgress: (completed: number, total: number) => setPngProgress({ completed, total }),
        });
        if (controller.signal.aborted) throw new Error("PNG export canceled.");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = outputPngName(outputItem.name);
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => releasePhotoBlobUrl(url), 30000);
        setNotice(
          "Finished PNG downloaded at the target physical size with " +
            outputDpi +
            " DPI raster geometry. Source detail may be lower."
        );
      } catch (cause) {
        if (controller.signal.aborted) setNotice("PNG export canceled. No file was downloaded.");
        else setError(displayError(cause));
      } finally {
        if (pngController.current === controller) pngController.current = null;
        setPngProgress(null);
        setExporting(false);
      }
    },
    [exporting, modeAssets, modeConfig, outputDpi, setError, setNotice]
  );

  const handleExport = useCallback(async () => {
    if (pdfController.current || pngController.current || batchController.current || exporting) return;
    if (result.message || selection.error || selection.pages.length === 0 || preflight.errors.length > 0) {
      setError(selection.error || preflight.errors[0]?.detail || result.message || "Resolve print errors before exporting.");
      return;
    }
    const controller = new AbortController();
    pdfController.current = controller;
    setError("");
    setNotice("");
    setExporting(true);
    setPdfProgress({ completed: 0, total: 1 });
    try {
      const { exportToPdf } = await import("../../features/exports/logic/exportPdf.ts");
      const file = await exportToPdf(
        selectedAssets,
        selection.pages,
        paper,
        modeConfig?.cutGuides ?? settings.cutGuides,
        rasterizeCrop,
        (modeConfig ? "outline" : settings.trimStyle ?? "outline") as TrimStyle,
        {
          marginMm: modeConfig?.marginMm ?? settings.marginMm,
          gapMm: modeConfig?.gapMm ?? settings.gapMm,
        },
        outputDpi,
        {
          signal: controller.signal,
          onProgress: (completed: number, total: number) => setPdfProgress({ completed, total }),
          ...(modeConfig
            ? modeJob?.cuts
              ? { notepadCuts: modeJob.cuts }
              : {}
            : settings.notepadPreset
            ? {
                notepadCuts: notepadCutLines(
                  settings.notepadPreset,
                  paper,
                  settings.orientation,
                  settings.marginMm
                ),
              }
            : {}),
          ...(modeConfig ? { lightCutMarks: true } : {}),
        }
      );
      if (controller.signal.aborted) throw new Error("PDF export canceled.");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        "prints-" +
        new Date().toISOString().slice(0, 10) +
        (pageRange.trim().toLowerCase() === "all" ? "" : "-selected-pages") +
        ".pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => releasePhotoBlobUrl(url), 30000);
      setNotice(selection.pages.length + " sheet(s) exported. Print at 100% / Actual Size.");
    } catch (cause) {
      if (controller.signal.aborted) setNotice("PDF export canceled. No file was downloaded.");
      else setError(displayError(cause));
    } finally {
      if (pdfController.current === controller) pdfController.current = null;
      setPdfProgress(null);
      setExporting(false);
    }
  }, [
    exporting,
    modeConfig,
    modeJob?.cuts,
    outputDpi,
    pageRange,
    paper,
    preflight.errors,
    result.message,
    selectedAssets,
    selection.error,
    selection.pages,
    setError,
    setNotice,
    settings.cutGuides,
    settings.gapMm,
    settings.marginMm,
    settings.notepadPreset,
    settings.orientation,
    settings.trimStyle,
  ]);

  return {
    // State
    paper,
    modeConfig,
    modeJob,
    modeCoverage,
    modeAssets,
    modeLabel,
    totalCopies,
    outputDpi,
    notepadInfo,
    notepadCuts,
    result,
    previewIndex,
    safePreviewIndex,
    previewExpanded,
    pageRange,
    selection,
    selectedAssets,
    pageCoverage,
    arrangeMode,
    previews,
    previewFailures,
    modePreviews,
    modeRasterErrors,
    preflight,
    printCheckRef,
    showExport,
    exportTarget,
    exporting,
    pdfProgress,
    pngProgress,
    batchProgress,

    // Actions
    setPreviewIndex,
    setPreviewExpanded,
    setPageRange,
    setArrangeMode,
    setShowExport,
    setExportTarget,
    moveOnSheet,
    rotateOnSheet,
    resetSheetArrangement,
    retryFailedPreviews,
    retryModePreviews,
    cancelExports,
    handleExport,
    handlePngExport,
    handleBatchExport,
    handleCalibration,
  };
}
