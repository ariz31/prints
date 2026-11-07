import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import { duplicatePrintDesign } from "../../features/photo-editor/logic/duplicateDesign.ts";
import { withProcessedImage } from "../../domain/validation/assetIntegrity.ts";
import type { ProjectSettings as Preferences } from "../../domain/models/project.ts";
import type { CropRegion, CropShape } from "../../domain/models/crop.ts";
import type { PhotoAdjustments } from "../../features/photo-editor/logic/photoAdjustments.ts";
import { DEFAULT_ADJUSTMENTS, mergeGlobalPhotoAdjustments } from "../../features/photo-editor/logic/photoAdjustments.ts";
import type { AppRoute, WorkspaceView, EditorView } from "../navigation/appNavigation.ts";
import { readAppRoute, recordAppNavigation } from "../navigation/appNavigation.ts";

export interface EditorModalControllerOptions {
  assets: PhotoAsset[];
  settings: Preferences;
  updateItem: (value: PhotoAsset) => void;
  duplicateItem: (item: PhotoAsset) => void;
  rememberEdit: (items?: PhotoAsset[], print?: Preferences) => void;
  setAssets: Dispatch<SetStateAction<PhotoAsset[]>>;
  setSettings: Dispatch<SetStateAction<Preferences>>;
  applyProcessedBackground: (item: PhotoAsset, blob: Blob, width: number, height: number) => void;
  resetProcessedBackground: (item: PhotoAsset) => void;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  previews: Record<string, string>;
}

export type ActiveModalDescriptor =
  | { type: "crop"; item: PhotoAsset }
  | { type: "background"; item: PhotoAsset }
  | { type: "layers"; item: PhotoAsset; previewUrl?: string }
  | { type: "adjust"; item: PhotoAsset }
  | { type: "id"; item: PhotoAsset };

export interface EditorModalControllerState {
  route: AppRoute;
  mobileView: WorkspaceView;
  showPreferences: boolean;
  activeModal: ActiveModalDescriptor | null;
}

export interface EditorModalControllerActions {
  navigate: (next: AppRoute, replaceHistory?: boolean) => void;
  navigateView: (view: WorkspaceView) => void;
  openEditor: (editor: EditorView, assetId: string) => void;
  closeOverlay: () => void;
  resetWorkspaceRoute: () => void;
  openPreferences: () => void;

  handleCropUpdate: (value: { crop: CropRegion; cropShape?: CropShape;
    widthMm?: number; heightMm?: number; adjustments?: PhotoAdjustments }) => void;
  handleCropRestoreOriginal: () => void;
  handleBackgroundApply: (blob: Blob, width: number, height: number) => void;
  handleBackgroundReset: () => void;
  handleAdjustApply: (adjustments?: PhotoAdjustments) => void;
  handleAdjustApplyAll: (adjustments?: PhotoAdjustments) => void;
  handleAdjustRestoreOriginal: () => void;
  handleLayersChange: (value: PhotoAsset) => void;
  handleIdCreate: (
    variants: Array<{ size: { label: string; widthMm: number; heightMm: number }; crop: CropRegion }>,
    quantity: number,
    backgroundColor?: string
  ) => void;
  handleIdOpenCrop: () => void;
  handleIdOpenBackground: () => void;
}

export type EditorModalController = EditorModalControllerState & EditorModalControllerActions;

export function useEditorModalController(options: EditorModalControllerOptions): EditorModalController {
  const {
    assets,
    settings,
    updateItem,
    rememberEdit,
    setAssets,
    setSettings,
    applyProcessedBackground,
    resetProcessedBackground,
    setError,
    setNotice,
    previews,
  } = options;

  const [route, setRoute] = useState<AppRoute>(() =>
    readAppRoute(typeof window === "undefined" ? "/preview" : window.location.href)
  );
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    const pop = () => {
      const next = readAppRoute(window.location.href);
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const navigate = useCallback((next: AppRoute, replaceHistory = false) => {
    if (typeof window !== "undefined") {
      if (!recordAppNavigation(window.history, routeRef.current, next, replaceHistory)) return;
    }
    routeRef.current = next;
    setRoute(next);
  }, []);

  const navigateView = useCallback(
    (view: WorkspaceView) => {
      navigate({ view });
    },
    [navigate]
  );

  const openEditor = useCallback(
    (editor: EditorView, assetId: string) => {
      navigate({ view: "preview", editor, assetId });
    },
    [navigate]
  );

  const openPreferences = useCallback(() => {
    navigate({ view: routeRef.current.view, preferences: true });
  }, [navigate]);

  const closeOverlay = useCallback(() => {
    const current = routeRef.current;
    if (!current.editor && !current.preferences) return;
    const depth =
      typeof window !== "undefined"
        ? Number((window.history.state as Record<string, unknown> | null)?.printsDepth) || 0
        : 0;
    if (depth > 0) {
      window.history.back();
    } else {
      navigate({ view: current.view }, true);
    }
  }, [navigate]);

  const resetWorkspaceRoute = useCallback(() => {
    navigate({ view: "preview" }, true);
  }, [navigate]);

  const mobileView = route.view;
  const showPreferences = route.preferences === true;

  const activeModal: ActiveModalDescriptor | null = useMemo(() => {
    if (!route.editor || !route.assetId) return null;
    const asset = assets.find(a => a.id === route.assetId);
    if (!asset) return null;
    if (route.editor === "crop") return { type: "crop", item: asset };
    if (route.editor === "background") return { type: "background", item: asset };
    if (route.editor === "layers") return { type: "layers", item: asset, previewUrl: previews[asset.id] };
    if (route.editor === "adjust") return { type: "adjust", item: asset };
    if (route.editor === "id") return { type: "id", item: asset };
    return null;
  }, [route.editor, route.assetId, assets, previews]);

  const handleCropUpdate = useCallback(
    (value: { crop: CropRegion; cropShape?: CropShape;
      widthMm?: number; heightMm?: number; adjustments?: PhotoAdjustments }) => {
      if (activeModal?.type === "crop") {
        const widthMm=value.widthMm??activeModal.item.widthMm;
        const heightMm=value.heightMm??activeModal.item.heightMm;
        if (![widthMm,heightMm].every(n=>Number.isFinite(n)&&n>0&&n<=2000)) {
          setError("Invalid physical crop dimensions.");return;
        }
        const imageWidth=activeModal.item.processedWidth??activeModal.item.pixelWidth;
        const imageHeight=activeModal.item.processedHeight??activeModal.item.pixelHeight;
        const actualRatio=value.crop.width*imageWidth/(value.crop.height*imageHeight);
        if(!Number.isFinite(actualRatio) ||
          Math.abs(actualRatio/(widthMm/heightMm)-1)>.002){
          setError("Crop source aspect must match the requested print dimensions.");return;
        }
        updateItem({ ...activeModal.item, crop: value.crop,
          cropShape: value.cropShape, widthMm, heightMm,
          adjustments:value.adjustments??activeModal.item.adjustments });
      }
    },
    [activeModal, updateItem, setError]
  );

  const handleCropRestoreOriginal = useCallback(() => {
    if (activeModal?.type === "crop") {
      updateItem(withProcessedImage(activeModal.item, null));
    }
  }, [activeModal, updateItem]);

  const handleBackgroundApply = useCallback(
    (blob: Blob, width: number, height: number) => {
      if (activeModal?.type === "background") {
        applyProcessedBackground(activeModal.item, blob, width, height);
        closeOverlay();
      }
    },
    [activeModal, applyProcessedBackground, closeOverlay]
  );

  const handleBackgroundReset = useCallback(() => {
    if (activeModal?.type === "background") {
      resetProcessedBackground(activeModal.item);
    }
  }, [activeModal, resetProcessedBackground]);

  const handleAdjustApply = useCallback(
    (adjustments?: PhotoAdjustments) => {
      if (activeModal?.type === "adjust") {
        updateItem({ ...activeModal.item, adjustments });
        closeOverlay();
      }
    },
    [activeModal, closeOverlay, updateItem]
  );

  const handleAdjustApplyAll = useCallback(
    (adjustments?: PhotoAdjustments) => {
      rememberEdit();
      setAssets(current =>
        current.map(asset => {
          return {
            ...asset,
            adjustments: mergeGlobalPhotoAdjustments(asset.adjustments, adjustments ?? DEFAULT_ADJUSTMENTS),
          };
        })
      );
      setNotice("Global photo edits applied to the batch. Review each crop and local retouches before printing.");
      closeOverlay();
    },
    [closeOverlay, rememberEdit, setAssets, setNotice]
  );

  const handleAdjustRestoreOriginal = useCallback(() => {
    if (activeModal?.type === "adjust") {
      updateItem(withProcessedImage(activeModal.item, null));
      setNotice("Original image restored for this design. Review the crop before printing.");
    }
  }, [activeModal, setNotice, updateItem]);

  const handleLayersChange = useCallback(
    (value: PhotoAsset) => {
      updateItem(value);
    },
    [updateItem]
  );

  const handleIdCreate = useCallback(
    (variants: Array<{ size: { label: string; widthMm: number; heightMm: number }; crop: CropRegion }>, quantity: number, backgroundColor?: string) => {
      if (activeModal?.type === "id") {
        const editingId = activeModal.item;
        if (settings.notepadPreset) {
          setError("Turn off notepad cutting before creating multiple independent ID-photo sizes.");
          closeOverlay();
          return;
        }
        if (assets.length + variants.length > 25) {
          setError("This job supports up to 25 photo designs.");
          closeOverlay();
          return;
        }
        const total = assets.reduce((sum, asset) => sum + asset.quantity, 0) + quantity * variants.length;
        if (total > 1000) {
          setError("Reduce copies before creating ID variants: a print job supports at most 1,000 copies.");
          closeOverlay();
          return;
        }
        const created = variants.map(({ size, crop }) => {
          const duplicated = duplicatePrintDesign(
            editingId,
            crypto.randomUUID(),
            (editingId.layers ?? []).map(() => crypto.randomUUID())
          );
          const adjustments = backgroundColor
            ? { ...DEFAULT_ADJUSTMENTS, ...editingId.adjustments, backgroundColor }
            : editingId.adjustments;
          return {
            ...duplicated,
            name: editingId.name + " - " + size.label,
            widthMm: size.widthMm,
            heightMm: size.heightMm,
            quantity,
            crop,
            layers: [],
            adjustments,
          };
        });
        rememberEdit();
        setAssets(current => [...current, ...created]);
        setSettings((old: Preferences) => ({ ...old, manualPlacements: [] }));
        setNotice(created.length + " ID-photo sizes created. Review each crop and background before printing.");
        closeOverlay();
      }
    },
    [activeModal, assets, closeOverlay, rememberEdit, setAssets, setError, setNotice, setSettings, settings.notepadPreset]
  );

  const handleIdOpenCrop = useCallback(() => {
    if (activeModal?.type === "id") {
      navigate({ view: "preview", editor: "crop", assetId: activeModal.item.id }, true);
    }
  }, [activeModal, navigate]);

  const handleIdOpenBackground = useCallback(() => {
    if (activeModal?.type === "id") {
      navigate({ view: "preview", editor: "background", assetId: activeModal.item.id }, true);
    }
  }, [activeModal, navigate]);

  return {
    // State
    route,
    mobileView,
    showPreferences,
    activeModal,

    // Actions
    navigate,
    navigateView,
    openEditor,
    closeOverlay,
    resetWorkspaceRoute,
    openPreferences,
    handleCropUpdate,
    handleCropRestoreOriginal,
    handleBackgroundApply,
    handleBackgroundReset,
    handleAdjustApply,
    handleAdjustApplyAll,
    handleAdjustRestoreOriginal,
    handleLayersChange,
    handleIdCreate,
    handleIdOpenCrop,
    handleIdOpenBackground,
  };
}
