import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
} from "react";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import { duplicatePrintDesign } from "../../features/photo-editor/logic/duplicateDesign.ts";
import { withProcessedImage, assertSafeSourceSize } from "../../domain/validation/assetIntegrity.ts";
import type { ProjectSettings as Preferences, ProjectSummary, TrashSummary } from "../../domain/models/project.ts";
import { defaultPrintSettings } from "../../features/preferences/logic/preferences.ts";
import type { UserPreferences } from "../../domain/models/preferences.ts";
import {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  stashDeletedDesign,
  listTrash,
  restoreDeletedProject,
  readDeletedDesign,
  permanentlyDeleteTrash,
  purgeExpiredTrash,
  createProjectSnapshot,
  materializeProject,
  storedProjectRevision,
  beginProjectSave,
} from "../../features/projects/logic/projectStore.ts";
import { createProjectZipArchive, readProjectZipArchive } from "../../features/projects/logic/projectZipArchive.ts";
import { readProjectArchive } from "../../features/projects/logic/projectArchive.ts";
import type { RecoverySummary } from "../../features/projects/logic/draftRecovery.ts";
import {
  listRecoverableDrafts,
  readRecoverableDraft,
  storeRecoverableDraft,
  loadRecoverableDraft,
  discardRecoverableDraft,
} from "../../features/projects/logic/draftRecovery.ts";
import {
  matchesActiveRecovery,
  planRecoveredWorkspace,
} from "../../features/projects/logic/workspaceRecovery.ts";
import type { NamedPreset } from "../../features/photo-editor/logic/presetLibrary.ts";
import {
  readPresetLibrary,
  writePresetLibrary,
} from "../../features/photo-editor/logic/presetLibrary.ts";
import type { WorkflowStep } from "../../features/projects/logic/workflow.ts";
import {
  recordSemanticStep,
  makeStep,
  reusablePaperParameters,
} from "../../features/projects/logic/workflowEngine.ts";
import type { PaperSelection } from "../../features/paper-sizes/components/PaperSizePicker.tsx";
import type { NotepadPresetId } from "../../features/sheet-composer/logic/notepadLayout.ts";
import { notepadGrid } from "../../features/sheet-composer/logic/notepadLayout.ts";
import { getPaperDimensions } from "../../features/sheet-composer/logic/layout.ts";
import { reconcileSingleDesign, reconcilePaperSelection } from "../../features/sheet-composer/logic/paperReflow.ts";
import { fitCropToAspect, FULL_CROP } from "../../features/crop/logic/crop.ts";
import { DEFAULT_ADJUSTMENTS } from "../../features/photo-editor/logic/photoAdjustments.ts";
import { parseBoundedNumber } from "../../domain/validation/safeNumbers.ts";
import { WorkspaceEpoch } from "../../shared/utils/workspaceEpoch.ts";
import { emptyHistory, pushHistory, travelHistory, type History } from "../../shared/utils/history.ts";
import { referencedImageUrls } from "../../platform/storage/referencedAssets.ts";
import { registerPhotoBlob, releasePhotoBlobUrl } from "../../platform/storage/photoBlobRegistry.ts";
import { copyBlobBytes } from "../../platform/storage/durableBlobs.ts";
import { useActiveSession } from "./useActiveSession.ts";

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
        assertSafeSourceSize(img.naturalWidth, img.naturalHeight);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error("An imported image could not be read."));
    img.src = url;
  });
}

export type ProjectSnapshot = { items: PhotoAsset[]; print: Preferences };

export interface ProjectControllerOptions {
  userPrefs: UserPreferences;
  onCancelExports?: () => void;
  onResetRoute?: () => void;
  onAssetDeleted?: (assetId: string) => void;
  getRouteView?: () => string;
}

export interface ProjectControllerState {
  assets: PhotoAsset[];
  settings: Preferences;
  projectId: string | null;
  projectName: string;
  projectList: ProjectSummary[];
  selectedProject: string;
  projectBusy: boolean;
  historyCount: { undo: number; redo: number };
  autoSaveStatus: "idle" | "saving" | "saved" | "failed";
  checkpointStatus: "idle" | "saving" | "saved" | "failed";
  hydrated: boolean;
  recoveryList: RecoverySummary[];
  trashList: TrashSummary[];
  visibleTrash: TrashSummary[];
  savedPresets: NamedPreset[];
  presetName: string;
  selectedPreset: string;
  recording: boolean;
  recordedSteps: WorkflowStep[];
  error: string;
  notice: string;
}

export interface ProjectControllerActions {
  setAssets: Dispatch<SetStateAction<PhotoAsset[]>>;
  addFiles: (files: FileList | File[]) => Promise<void>;
  updateItem: (value: PhotoAsset) => void;
  removeItem: (item: PhotoAsset) => Promise<void>;
  duplicateItem: (item: PhotoAsset) => void;
  applyProcessedBackground: (item: PhotoAsset, blob: Blob, width: number, height: number) => void;
  resetProcessedBackground: (item: PhotoAsset) => void;

  setSettings: Dispatch<SetStateAction<Preferences>>;
  updateSetting: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  applyPaperSelection: (selection: PaperSelection) => void;
  selectNotepadPreset: (preset: NotepadPresetId | undefined) => void;
  enableAutomaticCopies: () => void;

  setPresetName: Dispatch<SetStateAction<string>>;
  setSelectedPreset: Dispatch<SetStateAction<string>>;
  savePreset: () => void;
  loadPreset: () => void;
  removePreset: () => void;

  rememberEdit: (items?: PhotoAsset[], print?: Preferences) => void;
  travel: (direction: "undo" | "redo") => void;
  resetHistory: () => void;

  setProjectName: Dispatch<SetStateAction<string>>;
  setSelectedProject: Dispatch<SetStateAction<string>>;
  saveCurrentProject: () => Promise<void>;
  openSavedProject: () => Promise<void>;
  removeSavedProject: () => Promise<void>;
  startNewProject: () => void;
  refreshProjectList: () => Promise<void>;

  restoreFromTrash: (entry: TrashSummary) => Promise<void>;
  deleteTrashPermanently: (entry: TrashSummary) => Promise<void>;
  refreshTrashList: () => Promise<void>;
  restoreUnsavedDraft: (id: string) => Promise<void>;
  discardUnsavedDraft: (id: string) => Promise<void>;

  setRecording: Dispatch<SetStateAction<boolean>>;
  setRecordedSteps: Dispatch<SetStateAction<WorkflowStep[]>>;
  recordStep: (step: WorkflowStep) => void;
  exportPortableBackup: () => Promise<void>;
  importPortableBackup: (file: File) => Promise<void>;
  handleBackupFile: (event: ChangeEvent<HTMLInputElement>) => void;

  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
}

export type ProjectController = ProjectControllerState & ProjectControllerActions;

export function useProjectController(options: ProjectControllerOptions): ProjectController {
  const { userPrefs, onCancelExports, onResetRoute, onAssetDeleted, getRouteView } = options;

  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [settings, setSettings] = useState<Preferences>(() => defaultPrintSettings(userPrefs));
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled print job");
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [checkpointStatus, setCheckpointStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [recoveryList, setRecoveryList] = useState<RecoverySummary[]>([]);
  const [trashList, setTrashList] = useState<TrashSummary[]>([]);
  const [savedPresets, setSavedPresets] = useState<NamedPreset[]>(readPresetLibrary);
  const [presetName, setPresetName] = useState("My print layout");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<WorkflowStep[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyCount, setHistoryCount] = useState({ undo: 0, redo: 0 });
  const [savedRevisionTick, setSavedRevisionTick] = useState(0);

  const history = useRef<History<ProjectSnapshot>>(emptyHistory<ProjectSnapshot>());
  const workspaceEpoch = useRef(new WorkspaceEpoch());
  const liveAssets = useRef(assets);
  const liveSettings = useRef(settings);
  liveAssets.current = assets;
  liveSettings.current = settings;

  const objectUrls = useRef(new Set<string>());
  const pendingImportUrls = useRef(new Set<string>());
  const deletingDesigns = useRef(new Set<string>());
  const saveSequence = useRef(0);
  const savedRevision = useRef<{ id: string; token: string } | null>(null);
  const tabSaveSession = useRef(crypto.randomUUID());

  const {
    sessionClaimed,
    activeSession,
    recoveryId,
    clonedSource,
    allowLegacyRecovery,
    hadWorkspace,
    lastRecoveryRevision,
    setActiveProjectPointer,
    beginDifferentWorkspace,
  } = useActiveSession();

  const historyChanged = useCallback(() => {
    setHistoryCount({ undo: history.current.undo.length, redo: history.current.redo.length });
  }, []);

  const resetHistory = useCallback(() => {
    onCancelExports?.();
    workspaceEpoch.current.advance();
    history.current = emptyHistory<ProjectSnapshot>();
    historyChanged();
  }, [onCancelExports, historyChanged]);

  const rememberEdit = useCallback(
    (items = liveAssets.current, print = liveSettings.current) => {
      onCancelExports?.();
      workspaceEpoch.current.advance();
      history.current = pushHistory(history.current, { items, print }, 50);
      historyChanged();
    },
    [onCancelExports, historyChanged]
  );

  const travel = useCallback(
    (direction: "undo" | "redo") => {
      const next = travelHistory(
        history.current,
        { items: liveAssets.current, print: liveSettings.current },
        direction
      );
      if (!next) return;
      onCancelExports?.();
      workspaceEpoch.current.advance();
      history.current = next.history;
      liveAssets.current = next.value.items;
      liveSettings.current = next.value.print;
      setAssets(next.value.items);
      setSettings(next.value.print);
      historyChanged();
      setError("");
      setNotice(direction === "undo" ? "Edit undone." : "Edit redone.");
    },
    [onCancelExports, historyChanged]
  );

  const recordStep = useCallback(
    (step: WorkflowStep) => {
      if (recording) setRecordedSteps(h => recordSemanticStep(h, step));
    },
    [recording]
  );

  const refreshProjectList = useCallback(async () => {
    setProjectList(await listProjects());
  }, []);

  const refreshTrashList = useCallback(async () => {
    setTrashList(await listTrash());
  }, []);

  // Keyboard undo/redo
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        const direction = key === "y" || (key === "z" && event.shiftKey) ? "redo" : "undo";
        travel(direction);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [travel]);

  // Object URL cleanup on unmount
  useEffect(() => () => {
    for (const url of objectUrls.current) releasePhotoBlobUrl(url);
  }, []);

  // Lifecycle garbage collection of unreferenced URLs
  useEffect(() => {
    const referenced = referencedImageUrls(
      assets,
      [...history.current.undo, ...history.current.redo],pendingImportUrls.current);
    for (const url of objectUrls.current) {
      if (!referenced.has(url)) {
        releasePhotoBlobUrl(url);
        objectUrls.current.delete(url);
      }
    }
  }, [assets, historyCount]);

  // Initial projects, recovery drafts, and trash loading
  useEffect(() => {
    void listRecoverableDrafts().then(setRecoveryList).catch(() => {});
    void listProjects().then(setProjectList).catch(() => {});
    void purgeExpiredTrash().then(() => listTrash()).then(setTrashList).catch(() => {});
  }, []);

  // Session restoration on claim
  useEffect(() => {
    if (!sessionClaimed) return;
    let cancelled = false;
    void (async () => {
      try {
        let checkpointFailure: unknown = null;
        let checkpoint = null as Awaited<ReturnType<typeof readRecoverableDraft>>;
        const duplicated = clonedSource.current;
        try {
          checkpoint = await readRecoverableDraft(duplicated?.id ?? recoveryId.current);
        } catch (cause) {
          checkpointFailure = cause;
          recoveryId.current = crypto.randomUUID();
          try {
            sessionStorage.setItem("prints:recovery-tab:v1", recoveryId.current);
          } catch {
            /* Storage error */
          }
        }
        const matching =
          checkpoint &&
          matchesActiveRecovery(
            checkpoint.workspaceToken,
            duplicated?.token ?? activeSession.current!.token,
            duplicated ? true : allowLegacyRecovery.current
          );
        let project = matching ? checkpoint!.project : null;
        let resumeId: string | null = null;
        let resumeRevision: string | null = null;
        let conflict = false;
        if (matching) {
          if (!duplicated) {
            lastRecoveryRevision.current = checkpoint!.revision;
            let current: { id: string; revision: string } | null = null;
            if (checkpoint!.origin) {
              try {
                const saved = await loadProject(checkpoint!.origin.projectId);
                current = { id: saved.id, revision: storedProjectRevision(saved) };
              } catch {
                /* Project missing */
              }
            }
            const plan = planRecoveredWorkspace(checkpoint!.origin, current);
            resumeId = plan.projectId;
            resumeRevision = plan.revision;
            conflict = plan.conflict;
          }
        } else if (duplicated?.projectId) {
          project = await loadProject(duplicated.projectId);
        } else if (activeSession.current?.projectId) {
          project = await loadProject(activeSession.current.projectId);
          resumeId = project.id;
          resumeRevision = storedProjectRevision(project);
        }
        if (cancelled) return;
        if (project) {
          const restored = materializeProject(project);
          if (cancelled) {
            for (const item of restored) {
              releasePhotoBlobUrl(item.url);
              if (item.processedUrl) releasePhotoBlobUrl(item.processedUrl);
            }
            return;
          }
          objectUrls.current = new Set(
            restored.flatMap(item => [item.url, ...(item.processedUrl ? [item.processedUrl] : [])])
          );
          hadWorkspace.current = true;
          setAssets(restored);
          setSettings(project.settings);
          setProjectName(project.name);
          savedRevision.current = resumeId && resumeRevision ? { id: resumeId, token: resumeRevision } : null;
          setProjectId(resumeId);
          setSelectedProject(resumeId ?? "");
          setActiveProjectPointer(resumeId);
          setAutoSaveStatus(resumeId ? "saved" : "idle");
          setNotice(
            duplicated
              ? "This tab is an independent copy. Save it separately to preserve both sets of edits."
              : conflict
              ? "Recovered a separate draft. The saved project changed or is missing; save this copy separately."
              : checkpointFailure
              ? "Named project restored. The damaged session checkpoint was preserved separately."
              : "Last workspace restored locally, including its designs and print settings."
          );
          if (checkpointFailure) {
            setError(
              "A session checkpoint could not be read: " +
                displayError(checkpointFailure) +
                ". The named project was restored instead."
            );
          }
        } else if (checkpointFailure) {
          setError(
            "The previous local checkpoint could not be read: " +
              displayError(checkpointFailure) +
              ". The original remains untouched. Check Projects or import a portable backup."
          );
        } else if (duplicated) {
          setNotice("This tab has a separate workspace. The source tab has no durable checkpoint to copy yet.");
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            "Automatic workspace recovery failed: " +
              displayError(cause) +
              ". Check Projects for saved copies before importing or creating another job."
          );
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionClaimed, setActiveProjectPointer, clonedSource, recoveryId, activeSession, allowLegacyRecovery, lastRecoveryRevision, hadWorkspace]);

  // Debounced autosave with CAS token fencing
  useEffect(() => {
    const generation = ++saveSequence.current;
    if (!projectId) return;
    const revision = beginProjectSave(projectId);
    setAutoSaveStatus("idle");
    if (userPrefs.autoSave === false) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (generation !== saveSequence.current) return;
        setAutoSaveStatus("saving");
        try {
          const snapshot = await createProjectSnapshot(projectId, projectName, settings, assets);
          if (generation !== saveSequence.current) return;
          const expected = savedRevision.current?.id === projectId ? savedRevision.current.token : null;
          const stored = await saveProject(snapshot, revision, expected, tabSaveSession.current);
          if (stored) {
            savedRevision.current = { id: projectId, token: storedProjectRevision(snapshot) };
            setSavedRevisionTick(tick => tick + 1);
          }
          if (generation === saveSequence.current) {
            setAutoSaveStatus(stored ? "saved" : "idle");
          }
        } catch (cause) {
          if (generation === saveSequence.current) {
            setAutoSaveStatus("failed");
            setError("Local autosave failed: " + displayError(cause));
          }
        }
      })();
    }, 10000);
    return () => {
      window.clearTimeout(timer);
      saveSequence.current++;
    };
  }, [projectId, projectName, settings, assets, userPrefs.autoSave]);

  // Checkpoint every committed workspace state in IndexedDB
  useEffect(() => {
    if (!hydrated) return;
    if (
      !hadWorkspace.current &&
      !projectId &&
      assets.length === 0 &&
      projectName === "Untitled print job" &&
      JSON.stringify(settings) === JSON.stringify(defaultPrintSettings(userPrefs))
    ) {
      return;
    }
    hadWorkspace.current = true;
    const id = recoveryId.current;
    const revision = Math.max(Date.now(), lastRecoveryRevision.current + 1);
    lastRecoveryRevision.current = revision;
    const token = activeSession.current!.token;
    const origin =
      projectId && savedRevision.current?.id === projectId
        ? { projectId, revision: savedRevision.current.token }
        : undefined;
    let disposed = false;
    setCheckpointStatus("saving");
    void (async () => {
      const snapshot = await createProjectSnapshot(id, projectName.trim() || "Untitled print job", settings, assets);
      if (disposed || activeSession.current?.token !== token) return;
      const stored = await storeRecoverableDraft(id, revision, snapshot, token, origin);
      if (disposed || activeSession.current?.token !== token) return;
      setCheckpointStatus(stored ? "saved" : "saving");
      setRecoveryList(await listRecoverableDrafts());
    })().catch(cause => {
      if (!disposed && activeSession.current?.token === token) {
        setCheckpointStatus("failed");
        setError("Session recovery failed: " + displayError(cause) + ". Save the project or download a portable backup.");
      }
    });
    return () => {
      disposed = true;
    };
  }, [hydrated, projectId, projectName, settings, assets, savedRevisionTick, hadWorkspace, recoveryId, lastRecoveryRevision, activeSession, userPrefs]);

  // Beforeunload warning
  useEffect(() => {
    if (!hydrated || !hadWorkspace.current || checkpointStatus === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hydrated, checkpointStatus, assets, settings, projectId, hadWorkspace]);

  // Asset mutations
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const origin = workspaceEpoch.current.capture();
      setError("");
      const routeRef = { current: { view: getRouteView?.() ?? "preview" } };
      if(!settings.printModeConfig&&routeRef.current.view!=="modes"&&settings.notepadPreset&&assets.length+files.length>1){
        setError("Notepad cutting supports one design per job. Turn off the notepad preset before adding more designs.");
        return;
      }
      if (assets.length + files.length > MAX_FILES) {
        setError("Limit: up to " + MAX_FILES + " source images per job in this initial release.");
        return;
      }
      const created: PhotoAsset[] = [];
      try {
        for (const file of Array.from(files)) {
          if (!IMAGE_TYPES.has(file.type)) throw new Error("Supported formats: JPG, PNG, and WebP.");
          if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error("Each image must be nonempty and no larger than 25 MB.");
          const ownedBlob=await copyBlobBytes(file);
          if (!workspaceEpoch.current.current(origin)) throw new Error("The workspace changed during image import.");
          const url = URL.createObjectURL(ownedBlob);
          registerPhotoBlob(url,ownedBlob);
          objectUrls.current.add(url);
          pendingImportUrls.current.add(url);
          try {
            const dimensions = await imageDimensions(url);
            created.push({
              id: crypto.randomUUID(),
              name: file.name,
              url,
              pixelWidth: dimensions.width,
              pixelHeight: dimensions.height,
              widthMm: 50.8,
              heightMm: 50.8,
              quantity: 1,
              focalX: 50,
              focalY: 50,
              crop: fitCropToAspect(FULL_CROP, dimensions.width, dimensions.height, 50.8, 50.8),
            });
          } catch (cause) {
            pendingImportUrls.current.delete(url);
            objectUrls.current.delete(url);
            releasePhotoBlobUrl(url);
            throw cause;
          }
        }
        if (!workspaceEpoch.current.current(origin)) {
          throw new Error("The workspace changed while loading images. Reimport into the current job.");
        }
        if (liveAssets.current.length + created.length > MAX_FILES) {
          throw new Error("This job supports at most 25 designs. The import was canceled safely.");
        }
        const effective =
          (routeRef.current.view === "modes" || !!liveSettings.current.printModeConfig)&&liveSettings.current.notepadPreset
            ? { ...liveSettings.current, notepadPreset: undefined }
            : liveSettings.current;
        const next = reconcileSingleDesign([...liveAssets.current, ...created], effective);
        rememberEdit(liveAssets.current, liveSettings.current);
        liveAssets.current = next;
        liveSettings.current = { ...effective, manualPlacements: [] };
        setSettings(liveSettings.current);
        setAssets(next);
        for (const asset of created) pendingImportUrls.current.delete(asset.url);
      } catch (cause) {
        for (const asset of created) {
          pendingImportUrls.current.delete(asset.url);
          objectUrls.current.delete(asset.url);
          releasePhotoBlobUrl(asset.url);
        }
        setError(displayError(cause));
      }
    },
    [assets.length, getRouteView, rememberEdit, settings.notepadPreset, settings.printModeConfig]
  );

  const updateItem = useCallback(
    (value: PhotoAsset) => {
      if (
        parseBoundedNumber(String(value.widthMm), 0.000001, 2000) === null ||
        parseBoundedNumber(String(value.heightMm), 0.000001, 2000) === null ||
        parseBoundedNumber(String(value.quantity), 1, 1000, true) === null
      ) {
        setError("Width and height must be positive, and copies must be a whole number from 1 to 1,000.");
        return;
      }
      const before = assets.find(item => item.id === value.id);
      if (!before) return;
      if (JSON.stringify(before) === JSON.stringify(value)) return;
      const sizeChanged = value.widthMm !== before.widthMm || value.heightMm !== before.heightMm;
      const shapeChanged = (value.cropShape ?? "rectangle") !== (before.cropShape ?? "rectangle") ||
        JSON.stringify(value.cropPolygon??null)!==JSON.stringify(before.cropPolygon??null);
      if ((value.cropPolygon || (value.cropShape && value.cropShape !== "rectangle")) &&
        (value.layers ?? []).some(layer => layer.visible)) {
        setError("Hide visible layers before applying a nonrectangular crop.");
        return;
      }
      const quantityChanged = value.quantity !== before.quantity;
      const nextConfig: Preferences = {
        ...settings,
        ...(quantityChanged ? { copyMode: "manual" as const } : {}),
        ...((sizeChanged || shapeChanged) && settings.notepadPreset ? { notepadPreset: undefined } : {}),
        ...(shapeChanged && (value.cropPolygon || value.cropShape !== "rectangle")
          ? { packing: "optimized" as const } : {}),
        ...(sizeChanged ||
        shapeChanged ||
        quantityChanged ||
        (value.layers ?? []).some(l => l.visible) !== (before.layers ?? []).some(l => l.visible)
          ? { manualPlacements: [] }
          : {}),
      };
      if (
        before &&
        sizeChanged &&
        Number.isFinite(value.widthMm) &&
        value.widthMm > 0 &&
        Number.isFinite(value.heightMm) &&
        value.heightMm > 0
      ) {
        value = {
          ...value,
          crop: fitCropToAspect(
            value.crop,
            value.processedWidth ?? value.pixelWidth,
            value.processedHeight ?? value.pixelHeight,
            value.widthMm,
            value.heightMm
          ),
        };
      }
      try {
        const next = reconcileSingleDesign(assets.map(asset => (asset.id === value.id ? value : asset)), nextConfig);
        rememberEdit();
        setSettings(nextConfig);
        setAssets(next);
      } catch (cause) {
        setError(displayError(cause));
        return;
      }
      if (sizeChanged) setNotice("Crop frame adjusted to the new print ratio. Open Crop to review.");
      if (before.widthMm !== value.widthMm || before.heightMm !== value.heightMm) {
        recordStep(makeStep("crop.to-size", { widthMm: value.widthMm, heightMm: value.heightMm }));
      }
      if (before.quantity !== value.quantity) recordStep(makeStep("copies.set", { quantity: value.quantity }));
      if (JSON.stringify(before.adjustments) !== JSON.stringify(value.adjustments)) {
        const values = { ...DEFAULT_ADJUSTMENTS, ...value.adjustments };
        const portable = Object.fromEntries(
          Object.entries(values).filter(([key, field]) => key !== "regions" && field !== undefined)
        ) as Record<string, string | number | boolean | null>;
        recordStep(makeStep("image.adjust", portable));
        if (JSON.stringify(before.adjustments?.regions) !== JSON.stringify(value.adjustments?.regions)) {
          recordStep(
            makeStep(
              "review.manual",
              {
                message: "Local retouches are crop-specific. Inspect and reapply brushes to each replacement image.",
              },
              "always"
            )
          );
        }
      }
      if (before.focalX !== value.focalX || before.focalY !== value.focalY) {
        recordStep(makeStep("crop.center", { focalX: value.focalX, focalY: value.focalY }, "on-uncertainty"));
      }
      if (JSON.stringify(before.crop) !== JSON.stringify(value.crop)) {
        recordStep(
          makeStep(
            "review.manual",
            { message: "Inspect the photo-specific crop selection on any replacement image." },
            "always"
          )
        );
      }
      if (JSON.stringify(before.layers) !== JSON.stringify(value.layers)) {
        recordStep(
          makeStep(
            "review.manual",
            { message: "Inspect editable design layers when processing a different image." },
            "always"
          )
        );
      }
    },
    [assets, recordStep, rememberEdit, settings]
  );

  const duplicateItem = useCallback(
    (item: PhotoAsset) => {
      if (settings.notepadPreset) {
        setError("Turn off notepad cutting before duplicating into an independently editable design.");
        return;
      }
      if (assets.length >= MAX_FILES) {
        setError("This print job supports up to " + MAX_FILES + " independently editable designs.");
        return;
      }
      const duplicated = duplicatePrintDesign(item, crypto.randomUUID(), (item.layers ?? []).map(() => crypto.randomUUID()));
      rememberEdit();
      setAssets(current => [...current, duplicated]);
      setSettings((old: Preferences) => ({ ...old, manualPlacements: [] }));
      setNotice("Design duplicated. Set a different crop, size or quantity without reimporting.");
    },
    [assets.length, rememberEdit, settings.notepadPreset]
  );

  const removeItem = useCallback(
    async (item: PhotoAsset) => {
      if (deletingDesigns.current.has(item.id)) return;
      const origin = workspaceEpoch.current.capture();
      deletingDesigns.current.add(item.id);
      setError("");
      try {
        const snapshot = await createProjectSnapshot(
          crypto.randomUUID(),
          projectName.trim() || "Untitled print job",
          liveSettings.current,
          [item]
        );
        if (!workspaceEpoch.current.current(origin)) {
          throw new Error("The workspace changed while preparing deletion. Retry the removal.");
        }
        const trashId = await stashDeletedDesign(snapshot.assets[0], projectId, projectName);
        const current = liveAssets.current;
        const latest = current.find(asset => asset.id === item.id);
        if (!latest) {
          await refreshTrashList();
          return;
        }
        if (!workspaceEpoch.current.current(origin) || latest !== item) {
          await permanentlyDeleteTrash(trashId);
          throw new Error("The workspace or design changed during deletion. Retry the removal.");
        }
        rememberEdit(current, liveSettings.current);
        const remaining = current.filter(asset => asset.id !== item.id);
        liveAssets.current = remaining;
        liveSettings.current = { ...liveSettings.current, manualPlacements: [] };
        setAssets(remaining);
        setSettings(liveSettings.current);
        onAssetDeleted?.(item.id);
        await refreshTrashList();
        setNotice(item.name + " moved to Recently Deleted. Use Undo to restore it.");
      } catch (cause) {
        setError("Image not deleted: " + displayError(cause));
      } finally {
        deletingDesigns.current.delete(item.id);
      }
    },
    [projectName, projectId, refreshTrashList, rememberEdit, onAssetDeleted]
  );

  const applyProcessedBackground = useCallback(
    (item: PhotoAsset, blob: Blob, width: number, height: number) => {
      rememberEdit();
      const processedUrl = URL.createObjectURL(blob);
      registerPhotoBlob(processedUrl, blob);
      objectUrls.current.add(processedUrl);
      setAssets(current =>
        current.map(asset => (asset.id === item.id ? withProcessedImage(asset, { url: processedUrl, width, height }) : asset))
      );
      recordStep(
        makeStep(
          "review.manual",
          {
            message: "Inspect the manually refined background of any newly imported image.",
          },
          "always"
        )
      );
      onResetRoute?.();
      setNotice("Processed background applied. Original photo preserved; save project to keep edits.");
    },
    [onResetRoute, recordStep, rememberEdit]
  );

  const resetProcessedBackground = useCallback(
    (item: PhotoAsset) => {
      rememberEdit();
      setAssets(current => current.map(asset => (asset.id === item.id ? withProcessedImage(asset, null) : asset)));
      setNotice("Reverted to the original unprocessed background.");
    },
    [rememberEdit]
  );

  // Settings & Presets
  const updateSetting = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      if (typeof value === "number") {
        const dimension = key === "customWidthMm" || key === "customHeightMm";
        const minimum = dimension ? 0.000001 : 0;
        if (parseBoundedNumber(String(value), minimum, dimension ? 2000 : 1999.999) === null) {
          setError(
            dimension
              ? "Custom paper dimensions must be greater than zero and no larger than 2000 mm."
              : "Paper margins and spacing must be between 0 and 2000 mm."
          );
          return;
        }
      }
      if (settings[key] === value) return;
      const layoutKeys = ["paper", "orientation", "customWidthMm", "customHeightMm", "marginMm", "gapMm", "packing", "autoRotate"];
      const reset = layoutKeys.includes(String(key));
      const next: Preferences = { ...settings, [key]: value, ...(reset ? { manualPlacements: [] } : {}) };
      if (next.notepadPreset && key === "packing" && value !== "optimized") {
        next.notepadPreset = undefined;
      }
      try {
        const updated = reset ? reconcileSingleDesign(assets, next) : assets;
        rememberEdit();
        setSettings(next);
        if (updated !== assets) setAssets(updated);
        recordStep(makeStep("sheet.configure", reusablePaperParameters(next)));
        setError("");
      } catch (cause) {
        setError(displayError(cause));
      }
    },
    [assets, recordStep, rememberEdit, settings]
  );

  const applyPaperSelection = useCallback(
    (selection: PaperSelection) => {
      if (
        settings.paper === selection.paper &&
        (selection.paper !== "Custom" ||
          (settings.customWidthMm === selection.customWidthMm && settings.customHeightMm === selection.customHeightMm))
      ) {
        return;
      }
      const next: Preferences = { ...settings, ...selection, manualPlacements: [] };
      try {
        const { items: updated, requiresAdjustment: noFit } = reconcilePaperSelection(assets, next);
        rememberEdit();
        setSettings(next);
        if (updated !== assets) setAssets(updated);
        recordStep(makeStep("sheet.configure", reusablePaperParameters(next)));
        setError("");
        setNotice(
          noFit
            ? "Paper changed. The current design or cutting inset does not fit; reduce artwork size or margins before exporting."
            : ""
        );
      } catch (cause) {
        setError(displayError(cause));
      }
    },
    [assets, recordStep, rememberEdit, settings]
  );

  const selectNotepadPreset = useCallback(
    (preset: NotepadPresetId | undefined) => {
      if (assets.length > 1) {
        setError("Notepad cutting repeats one design. Open a separate print job for each design.");
        return;
      }
      const next: Preferences = {
        ...settings,
        notepadPreset: preset,
        manualPlacements: [],
        ...(preset ? { packing: "optimized" as const } : {}),
      };
      try {
        const updated = reconcileSingleDesign(assets, next);
        rememberEdit();
        setSettings(next);
        setAssets(updated);
        setError("");
        setNotice(
          preset
            ? "Notepad grid applied. Physical cut cells stay equal; the artwork is inset by the margin."
            : "Notepad cutting disabled. Select a print size if you want to change the artwork dimensions."
        );
      } catch (cause) {
        setError(displayError(cause));
      }
    },
    [assets, rememberEdit, settings]
  );

  const enableAutomaticCopies = useCallback(() => {
    try {
      const next: Preferences = { ...settings, copyMode: "automatic", manualPlacements: [] };
      const updated = reconcileSingleDesign(assets, next);
      rememberEdit();
      setSettings(next);
      setAssets(updated);
      setError("");
      setNotice("Automatically calculated copies for the selected paper layout.");
    } catch (cause) {
      setError(displayError(cause));
    }
  }, [assets, rememberEdit, settings]);

  const savePreset = useCallback(() => {
    try {
      const name = presetName.trim();
      if (!name || name.length > 80) throw new Error("Enter a preset name (up to 80 characters).");
      const first = assets[0];
      const paper = getPaperDimensions(settings.paper, settings.orientation, {
        widthMm: settings.customWidthMm,
        heightMm: settings.customHeightMm,
      });
      const grid = settings.notepadPreset ? notepadGrid(settings.notepadPreset, paper, settings.orientation, settings.marginMm) : null;
      const id = crypto.randomUUID();
      const preset: NamedPreset = {
        id,
        name,
        updatedAt: new Date().toISOString(),
        settings: { ...settings, manualPlacements: [] },
        itemWidthMm: first?.widthMm ?? grid?.artWidthMm ?? 50.8,
        itemHeightMm: first?.heightMm ?? grid?.artHeightMm ?? 50.8,
        quantity: first?.quantity ?? (settings.copyMode === "automatic" && grid ? grid.copiesPerSheet : 1),
      };
      const next = [preset, ...savedPresets].slice(0, 40);
      writePresetLibrary(next);
      setSavedPresets(next);
      setSelectedPreset(id);
      setNotice("Named layout saved for future jobs.");
      setError("");
    } catch (cause) {
      setError(displayError(cause));
    }
  }, [assets, presetName, savedPresets, settings]);

  const loadPreset = useCallback(() => {
    try {
      const preset = savedPresets.find(p => p.id === selectedPreset);
      if (!preset) throw new Error("Choose a saved layout first.");
      if (preset.settings.notepadPreset && assets.length > 1) {
        throw new Error("A saved notepad layout requires one design. Open a separate print job.");
      }
      rememberEdit();
      setSettings({ ...preset.settings, manualPlacements: [] });
      setAssets(current =>
        current.map(asset => ({
          ...asset,
          widthMm: preset.itemWidthMm,
          heightMm: preset.itemHeightMm,
          crop: fitCropToAspect(
            asset.crop,
            asset.processedWidth ?? asset.pixelWidth,
            asset.processedHeight ?? asset.pixelHeight,
            preset.itemWidthMm,
            preset.itemHeightMm
          ),
          quantity: preset.quantity,
        }))
      );
      setNotice("Layout " + preset.name + " applied to this print job.");
      setError("");
    } catch (cause) {
      setError(displayError(cause));
    }
  }, [assets.length, rememberEdit, savedPresets, selectedPreset]);

  const removePreset = useCallback(() => {
    if (!selectedPreset || !window.confirm("Delete the selected layout preset?")) return;
    try {
      const next = savedPresets.filter(p => p.id !== selectedPreset);
      writePresetLibrary(next);
      setSavedPresets(next);
      setSelectedPreset("");
      setNotice("Saved layout deleted.");
    } catch (cause) {
      setError(displayError(cause));
    }
  }, [savedPresets, selectedPreset]);

  // Project persistence
  const saveCurrentProject = useCallback(async () => {
    const origin = workspaceEpoch.current.capture();
    setProjectBusy(true);
    setError("");
    try {
      const id = projectId ?? crypto.randomUUID();
      const revision = beginProjectSave(id);
      const snapshot = await createProjectSnapshot(id, projectName, settings, assets);
      if (!workspaceEpoch.current.current(origin)) {
        setNotice("The print job changed during saving. Save again to include the latest edits.");
        return;
      }
      const expected = savedRevision.current?.id === id ? savedRevision.current.token : null;
      const stored = await saveProject(snapshot, revision, expected, tabSaveSession.current);
      if (!workspaceEpoch.current.current(origin)) {
        return;
      }
      if (!stored) {
        setNotice("A newer save is pending. Current edits remain available.");
        return;
      }
      savedRevision.current = { id, token: storedProjectRevision(snapshot) };
      setActiveProjectPointer(id);
      setProjectId(id);
      setAutoSaveStatus("saved");
      setSelectedProject(id);
      await refreshProjectList();
      setNotice("Project saved locally, including original images and crop selections.");
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setProjectBusy(false);
    }
  }, [assets, projectId, projectName, refreshProjectList, setActiveProjectPointer, settings]);

  const openSavedProject = useCallback(async () => {
    if (!selectedProject) return;
    const origin = workspaceEpoch.current.capture();
    if (
      assets.length > 0 &&
      !window.confirm(
        "Opening another saved project will replace the current workspace. Save any unsaved edits first. Continue?"
      )
    ) {
      return;
    }
    setProjectBusy(true);
    setError("");
    try {
      const project = await loadProject(selectedProject);
      if (!workspaceEpoch.current.current(origin)) throw new Error("Workspace changed during opening. Reopen the project.");
      const imported = materializeProject(project);
      const oldUrls = [...objectUrls.current];
      objectUrls.current = new Set(
        imported.flatMap(asset => [asset.url, ...(asset.processedUrl ? [asset.processedUrl] : [])])
      );
      resetHistory();
      setAssets(imported);
      setSettings(project.settings);
      setSelectedPreset("");
      savedRevision.current = { id: project.id, token: storedProjectRevision(project) };
      beginDifferentWorkspace(project.id);
      setProjectId(project.id);
      setAutoSaveStatus("saved");
      setProjectName(project.name);
      onResetRoute?.();
      setRecordedSteps([]);
      setNotice("Saved project reopened with original source images.");
      for (const url of oldUrls) releasePhotoBlobUrl(url);
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setProjectBusy(false);
    }
  }, [assets.length, beginDifferentWorkspace, onResetRoute, resetHistory, selectedProject]);

  const removeSavedProject = useCallback(async () => {
    if (!selectedProject || !window.confirm("Delete the selected saved project from this browser?")) return;
    setProjectBusy(true);
    try {
      const expected =
        projectId === selectedProject && savedRevision.current?.id === selectedProject
          ? savedRevision.current.token
          : projectList.find(p => p.id === selectedProject)?.revision;
      if (!expected) throw new Error("Project list is out of date. Refresh or reopen before deleting.");
      await deleteProject(selectedProject, expected);
      if (projectId === selectedProject) {
        savedRevision.current = null;
        setActiveProjectPointer(null);
        setProjectId(null);
      }
      setSelectedProject("");
      await refreshProjectList();
      await refreshTrashList();
      setNotice("Saved project moved to Recently Deleted. The current workspace remains open.");
    } catch (cause) {
      setError(displayError(cause));
      await refreshProjectList().catch(() => {});
    } finally {
      setProjectBusy(false);
    }
  }, [projectId, projectList, refreshProjectList, refreshTrashList, selectedProject, setActiveProjectPointer]);

  const startNewProject = useCallback(() => {
    if (
      assets.length > 0 &&
      !window.confirm("Start a new print job? Save or download a backup before discarding unsaved changes.")
    ) {
      return;
    }
    for (const url of objectUrls.current) releasePhotoBlobUrl(url);
    objectUrls.current.clear();
    resetHistory();
    savedRevision.current = null;
    const priorRecoveryId = recoveryId.current;
    beginDifferentWorkspace(null);
    void discardRecoverableDraft(priorRecoveryId)
      .then(() => listRecoverableDrafts().then(setRecoveryList))
      .catch(() => {});
    setAssets([]);
    setSettings(defaultPrintSettings(userPrefs));
    setProjectId(null);
    setSelectedPreset("");
    setAutoSaveStatus("idle");
    setProjectName("Untitled print job");
    setSelectedProject("");
    onResetRoute?.();
    setNotice("New blank project created.");
  }, [assets.length, beginDifferentWorkspace, onResetRoute, recoveryId, resetHistory, userPrefs]);

  // Trash & Recovery
  const restoreFromTrash = useCallback(
    async (entry: TrashSummary) => {
      if (projectBusy) return;
      setProjectBusy(true);
      setError("");
      try {
        if (entry.kind === "project") {
          const restored = await restoreDeletedProject(entry.id);
          await refreshProjectList();
          setSelectedProject(restored.id);
          setNotice("Recovered " + restored.name + ". Select Open to continue editing.");
        } else {
          const origin = workspaceEpoch.current.capture();
          if (liveAssets.current.length >= MAX_FILES) {
            throw new Error(
              "Remove another design or start a new job before restoring; the workspace supports 25 designs."
            );
          }
          if (liveAssets.current.some(asset => asset.id === entry.assetId)) {
            throw new Error("This design is already present in the current job.");
          }
          const stored = await readDeletedDesign(entry.id);
          if (!workspaceEpoch.current.current(origin)) {
            throw new Error("Workspace changed while loading recovery. Retry in the intended project.");
          }
          const project = {
            schemaVersion: 1 as const,
            id: crypto.randomUUID(),
            name: "Recovered design",
            updatedAt: new Date().toISOString(),
            settings: liveSettings.current,
            assets: [stored],
          };
          let [restored] = materializeProject(project);
          if (liveAssets.current.some(asset => asset.id === restored.id)) {
            restored = { ...restored, id: crypto.randomUUID() };
          }
          objectUrls.current.add(restored.url);
          if (restored.processedUrl) objectUrls.current.add(restored.processedUrl);
          const next = [...liveAssets.current, restored];
          rememberEdit(liveAssets.current, liveSettings.current);
          liveAssets.current = next;
          liveSettings.current = { ...liveSettings.current, manualPlacements: [] };
          setAssets(next);
          setSettings(liveSettings.current);
          setNotice("Recovered " + restored.name + " with its original image, crop, adjustments and layers.");
        }
        await refreshTrashList();
      } catch (cause) {
        setError("Recovery failed: " + displayError(cause));
      } finally {
        setProjectBusy(false);
      }
    },
    [projectBusy, refreshProjectList, refreshTrashList, rememberEdit]
  );

  const deleteTrashPermanently = useCallback(
    async (entry: TrashSummary) => {
      if (!window.confirm("Permanently erase the recovery copy of " + entry.name + "? This cannot be undone.")) return;
      setProjectBusy(true);
      setError("");
      try {
        await permanentlyDeleteTrash(entry.id);
        await refreshTrashList();
        setNotice("Recovery copy permanently deleted.");
      } catch (cause) {
        setError(displayError(cause));
      } finally {
        setProjectBusy(false);
      }
    },
    [refreshTrashList]
  );

  const restoreUnsavedDraft = useCallback(
    async (id: string) => {
      if (
        assets.length > 0 &&
        !window.confirm("Replace this workspace with the recoverable draft? Save a backup first if needed.")
      ) {
        return;
      }
      const epoch = workspaceEpoch.current.capture();
      setProjectBusy(true);
      setError("");
      try {
        const snapshot = await loadRecoverableDraft(id);
        if (!workspaceEpoch.current.current(epoch)) throw new Error("Workspace changed while restoring.");
        const imported = materializeProject(snapshot);
        const oldUrls = [...objectUrls.current];
        objectUrls.current = new Set(
          imported.flatMap(asset => [asset.url, ...(asset.processedUrl ? [asset.processedUrl] : [])])
        );
        resetHistory();
        savedRevision.current = null;
        beginDifferentWorkspace(null);
        hadWorkspace.current = true;
        setAssets(imported);
        setSettings(snapshot.settings);
        setProjectId(null);
        setProjectName(snapshot.name);
        setSelectedPreset("");
        onResetRoute?.();
        setNotice("Unsaved draft recovered. Save it as a named project or download a backup.");
        for (const url of oldUrls) releasePhotoBlobUrl(url);
      } catch (cause) {
        setError(displayError(cause));
      } finally {
        setProjectBusy(false);
      }
    },
    [assets.length, beginDifferentWorkspace, onResetRoute, resetHistory, hadWorkspace]
  );

  const discardUnsavedDraft = useCallback(
    async (id: string) => {
      if (!window.confirm("Permanently discard this recovered draft?")) return;
      try {
        await discardRecoverableDraft(id);
        setRecoveryList(await listRecoverableDrafts());
      } catch (cause) {
        setError(displayError(cause));
      }
    },
    []
  );

  // Workflows & Backups
  const exportPortableBackup = useCallback(async () => {
    setProjectBusy(true);
    setError("");
    try {
      const snapshot = await createProjectSnapshot(projectId ?? crypto.randomUUID(), projectName, settings, assets);
      const backup = await createProjectZipArchive(snapshot);
      const url = URL.createObjectURL(backup);
      const link = document.createElement("a");
      link.href = url;
      link.download = (projectName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "prints-project") + ".prints.zip";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => releasePhotoBlobUrl(url), 60000);
      setNotice("Portable backup downloaded with all original/processed images and design data.");
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setProjectBusy(false);
    }
  }, [assets, projectId, projectName, settings]);

  const importPortableBackup = useCallback(
    async (file: File) => {
      const origin = workspaceEpoch.current.capture();
      if (assets.length > 0 && !window.confirm("Importing will replace the current workspace. Save any unsaved work first. Continue?")) {
        return;
      }
      setProjectBusy(true);
      setError("");
      try {
        const imported =
          file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip"
            ? await readProjectZipArchive(file)
            : await readProjectArchive(file);
        if (!workspaceEpoch.current.current(origin)) {
          throw new Error("Workspace changed during backup import. Import again.");
        }
        if (!(await saveProject(imported))) throw new Error("Imported project was superseded before saving.");
        if (!workspaceEpoch.current.current(origin)) {
          throw new Error("Workspace changed while saving the imported backup. Open the saved import manually.");
        }
        const materialized = materializeProject(imported);
        const oldUrls = [...objectUrls.current];
        objectUrls.current = new Set(
          materialized.flatMap(asset => [asset.url, ...(asset.processedUrl ? [asset.processedUrl] : [])])
        );
        resetHistory();
        setAssets(materialized);
        setSettings(imported.settings);
        setSelectedPreset("");
        savedRevision.current = { id: imported.id, token: storedProjectRevision(imported) };
        beginDifferentWorkspace(imported.id);
        setProjectId(imported.id);
        setAutoSaveStatus("saved");
        setProjectName(imported.name);
        setSelectedProject(imported.id);
        onResetRoute?.();
        setRecordedSteps([]);
        await refreshProjectList();
        for (const url of oldUrls) releasePhotoBlobUrl(url);
        setNotice("Portable project imported into local storage. Original project IDs were not overwritten.");
      } catch (cause) {
        setError(displayError(cause));
      } finally {
        setProjectBusy(false);
      }
    },
    [assets.length, beginDifferentWorkspace, onResetRoute, refreshProjectList, resetHistory]
  );

  const handleBackupFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void importPortableBackup(file);
    },
    [importPortableBackup]
  );

  const visibleTrash = useMemo(
    () => trashList.filter(entry => entry.kind === "project" || !assets.some(asset => asset.id === entry.assetId)),
    [trashList, assets]
  );

  return {
    // State
    assets,
    settings,
    projectId,
    projectName,
    projectList,
    selectedProject,
    projectBusy,
    historyCount,
    autoSaveStatus,
    checkpointStatus,
    hydrated,
    recoveryList,
    trashList,
    visibleTrash,
    savedPresets,
    presetName,
    selectedPreset,
    recording,
    recordedSteps,
    error,
    notice,

    // Actions
    setAssets,
    addFiles,
    updateItem,
    removeItem,
    duplicateItem,
    applyProcessedBackground,
    resetProcessedBackground,
    setSettings,
    updateSetting,
    applyPaperSelection,
    selectNotepadPreset,
    enableAutomaticCopies,
    setPresetName,
    setSelectedPreset,
    savePreset,
    loadPreset,
    removePreset,
    rememberEdit,
    travel,
    resetHistory,
    setProjectName,
    setSelectedProject,
    saveCurrentProject,
    openSavedProject,
    removeSavedProject,
    startNewProject,
    refreshProjectList,
    restoreFromTrash,
    deleteTrashPermanently,
    refreshTrashList,
    restoreUnsavedDraft,
    discardUnsavedDraft,
    setRecording,
    setRecordedSteps,
    recordStep,
    exportPortableBackup,
    importPortableBackup,
    handleBackupFile,
    setError,
    setNotice,
  };
}
