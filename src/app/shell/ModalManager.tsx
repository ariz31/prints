import { lazy, Suspense, type ComponentType } from "react";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import type { ModeImageCoverage } from "../controllers/workspaceController.ts";
import type { PreflightReport } from "../../domain/validation/printPreflight.ts";
import type { UserPreferences } from "../../domain/models/preferences.ts";
import type { CustomPaperSize } from "../../features/paper-sizes/logic/paperLibrary.ts";
import type { EditorModalController, ActiveModalDescriptor } from "../controllers/editorModalController.ts";
import ExportDialog from "../../components/ExportDialog.tsx";
import PreferencesPanel from "../../components/PreferencesPanel.tsx";

function deferred<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>) {
  const Editor = lazy(loader);
  return (props: P) => (
    <Suspense fallback={<main className="editor-loading" role="status">Opening editor…</main>}>
      <Editor {...props} />
    </Suspense>
  );
}

const CropEditor = deferred(() => import("../../components/CropEditor.tsx"));
const PhotoAdjustEditor = deferred(() => import("../../components/PhotoAdjustEditor.tsx"));
const IdPhotoStudio = deferred(() => import("../../components/IdPhotoStudio.tsx"));
const BackgroundEditor = deferred(() => import("../../components/BackgroundEditor.tsx"));
const LayerPanel = deferred(() => import("../../components/LayerPanel.tsx"));

export interface ModalManagerProps {
  activeModal: ActiveModalDescriptor | null;
  editorModal: EditorModalController;

  // Floating dialogs
  showExport: boolean;
  exportTarget: { format: "pdf" | "png" | "zip"; id?: string };
  modeAssets: PhotoAsset[];
  modeCoverage?: ModeImageCoverage;
  pageCoverage?: ModeImageCoverage;
  outputDpi: number;
  pageRange: string;
  pageCount: number;
  pageError?: string;
  preflight: PreflightReport;
  exportBusy: boolean;
  exportProgress: { completed: number; total: number } | null;
  error: string;
  notice: string;
  onDpi: (dpi: number) => void;
  onPages: (value: string) => void;
  onCloseExport: () => void;
  onCancelExport: () => void;
  onExportPdf: () => void;
  onExportPng: (asset: PhotoAsset) => void;
  onExportZip: () => void;

  showPreferences: boolean;
  userPrefs: UserPreferences;
  customPapers: CustomPaperSize[];
  onPaperLibraryChange: (list: CustomPaperSize[]) => void;
  onSavePreferences: (prefs: UserPreferences) => void;
}

export function FullScreenEditorHost({
  activeModal,
  editorModal,
}: {
  activeModal: ActiveModalDescriptor | null;
  editorModal: EditorModalController;
}) {
  const editingId = activeModal?.type === "id" ? activeModal.item : undefined;
  if (editingId) {
    return (
      <IdPhotoStudio
        key={editingId.id}
        item={editingId}
        onClose={editorModal.closeOverlay}
        onOpenCrop={editorModal.handleIdOpenCrop}
        onOpenBackground={editorModal.handleIdOpenBackground}
        onCreate={editorModal.handleIdCreate}
      />
    );
  }

  const editingPhoto = activeModal?.type === "adjust" ? activeModal.item : undefined;
  if (editingPhoto) {
    return (
      <PhotoAdjustEditor
        key={editingPhoto.id}
        item={editingPhoto}
        onCancel={editorModal.closeOverlay}
        onRestoreOriginal={()=>{
          editorModal.handleAdjustRestoreOriginal();
        }}
        onApply={editorModal.handleAdjustApply}
        onApplyAll={editorModal.handleAdjustApplyAll}
      />
    );
  }

  const editingLayers = activeModal?.type === "layers" ? activeModal.item : undefined;
  if(editingLayers)return <LayerPanel key={editingLayers.id} item={editingLayers}
      previewUrl={activeModal?.type === "layers" ? activeModal.previewUrl : undefined}
      onChange={editorModal.handleLayersChange} onClose={editorModal.closeOverlay} />;

  const editingCrop = activeModal?.type === "crop" ? activeModal.item : undefined;
  if (editingCrop) {
    return (
      <CropEditor
        key={editingCrop.id}
        item={editingCrop}
        onUpdate={editorModal.handleCropUpdate}
        onRestoreOriginal={editorModal.handleCropRestoreOriginal}
        onClose={editorModal.closeOverlay}
      />
    );
  }

  const editingBackground = activeModal?.type === "background" ? activeModal.item : undefined;
  if (editingBackground) {
    return (
      <BackgroundEditor
        key={editingBackground.id}
        item={editingBackground}
        onApply={editorModal.handleBackgroundApply}
        otherAssets={editorModal.backgroundCandidates}
        onApplyBatch={editorModal.handleBackgroundBatch}
        onReset={editorModal.handleBackgroundReset}
        onClose={editorModal.closeOverlay}
      />
    );
  }

  return null;
}

export default function ModalManager({
  activeModal,
  editorModal,
  showExport,
  exportTarget,
  modeAssets,
  modeCoverage,
  pageCoverage,
  outputDpi,
  pageRange,
  pageCount,
  pageError,
  preflight,
  exportBusy,
  exportProgress,
  error,
  notice,
  onDpi,
  onPages,
  onCloseExport,
  onCancelExport,
  onExportPdf,
  onExportPng,
  onExportZip,
  showPreferences,
  userPrefs,
  customPapers,
  onPaperLibraryChange,
  onSavePreferences,
}: ModalManagerProps) {
  if (activeModal) {
    return <FullScreenEditorHost activeModal={activeModal} editorModal={editorModal} />;
  }

  return (
    <>
      {showExport && (
        <ExportDialog
          initialFormat={exportTarget.format}
          initialId={exportTarget.id}
          assets={modeAssets} coverage={modeCoverage} pageCoverage={pageCoverage} dpi={outputDpi}
          pages={pageRange}
          pageCount={pageCount}
          pageError={pageError}
          preflight={preflight}
          busy={exportBusy}
          progress={exportProgress}
          error={error}
          notice={notice}
          onDpi={onDpi}
          onPages={onPages}
          onClose={onCloseExport}
          onCancel={onCancelExport}
          onPdf={onExportPdf}
          onPng={onExportPng}
          onZip={onExportZip}
        />
      )}
      {showPreferences && (
        <PreferencesPanel
          preferences={userPrefs}
          customPapers={customPapers}
          onPaperLibraryChange={onPaperLibraryChange}
          onClose={editorModal.closeOverlay}
          onChange={onSavePreferences}
        />
      )}
    </>
  );
}
