import { useMemo, useEffect, useState, type ChangeEvent, type DragEvent, type RefObject } from "react";
import type { ProjectController } from "../controllers/projectController.ts";
import type { WorkspaceController } from "../controllers/workspaceController.ts";
import type { EditorModalController } from "../controllers/editorModalController.ts";
import type { UserPreferences } from "../../domain/models/preferences.ts";
import type { CustomPaperSize } from "../../features/paper-sizes/logic/paperLibrary.ts";
import { matchesNamedPreset } from "../../features/photo-editor/logic/presetLibrary.ts";
import { cropPreviewKey } from "../../platform/rendering/previewCache.ts";
import { formatPreviewCheckStatus } from "../../features/sheet-composer/logic/previewCaption.ts";
import AppHeader from "./AppHeader.tsx";
import AppSidebar from "./AppSidebar.tsx";
import AppItemsSidebar from "./AppItemsSidebar.tsx";
import ModalManager from "./ModalManager.tsx";
import { SheetPreview } from "../../features/sheet-composer/index.ts";
import QuickImageSettings from "../../features/sheet-composer/components/QuickImageSettings.tsx";
import { resolvePreviewImageSelection, type PreviewImageSelection } from "../../features/sheet-composer/logic/previewImageSelection.ts";
import PrintModeWorkspace from "../../components/PrintModeWorkspace.tsx";
import StudioIcon from "../../components/StudioIcon.tsx";
import HelpTip from "../../components/HelpTip.tsx";

export interface AppShellProps {
  project: ProjectController;
  workspace: WorkspaceController;
  editorModal: EditorModalController;
  userPrefs: UserPreferences;
  customPapers: CustomPaperSize[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  backupInputRef: RefObject<HTMLInputElement | null>;
  onPaperLibraryChange: (papers: CustomPaperSize[]) => void;
  onSavePreferences: (prefs: UserPreferences) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBackupFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export default function AppShell({
  project,
  workspace,
  editorModal,
  userPrefs,
  customPapers,
  fileInputRef,
  backupInputRef,
  onPaperLibraryChange,
  onSavePreferences,
  onFileChange,
  onBackupFile,
  onDrop,
}: AppShellProps) {
  const { assets, settings, setSettings, updateSetting, visibleTrash } = project;
  const { modeConfig, modeLabel, modeCoverage, modeAssets, modePreviews, previews, paper, safePreviewIndex } = workspace;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (editorModal.route.editor || workspace.showExport || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        const direction = key === "y" || (key === "z" && event.shiftKey) ? "redo" : "undo";
        project.travel(direction);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorModal.route.editor, workspace.showExport, project]);

  const matchingLayout = useMemo(
    () => project.savedPresets.find(p => matchesNamedPreset(p, settings, assets)),
    [project.savedPresets, settings, assets]
  );
  const chosenLayout = useMemo(
    () => project.savedPresets.find(p => p.id === project.selectedPreset),
    [project.savedPresets, project.selectedPreset]
  );
  const chosenLayoutApplied = !!(chosenLayout && matchesNamedPreset(chosenLayout, settings, assets));
  const presetDropdownId = chosenLayout ? chosenLayout.id : matchingLayout ? matchingLayout.id : "";

  const result = workspace.result;
  const [previewSelection, setPreviewSelection] = useState<PreviewImageSelection | null>(null);
  const selectedImage = resolvePreviewImageSelection(previewSelection, safePreviewIndex, result.pages[safePreviewIndex], assets);
  const totalCopies = workspace.totalCopies;
  const preflight = workspace.preflight;
  const printCheckRef = workspace.printCheckRef;
  const modeJob = workspace.modeJob;
  const notepadCuts = workspace.notepadCuts;
  const mobileView = editorModal.mobileView;
  const previewExpanded = workspace.previewExpanded;
  const setPreviewExpanded = workspace.setPreviewExpanded;
  const arrangeMode = workspace.arrangeMode;

  useEffect(() => {
    if(mobileView!=="preview")setPreviewExpanded(false);
  }, [mobileView, setPreviewExpanded]);

  useEffect(() => {
    // Changing workspaces/modes or starting manual arrangement dismisses the
    // quick editor, without discarding any persisted image or print edits.
    setPreviewSelection(null);
  }, [mobileView, modeConfig?.mode, arrangeMode]);

  const modalManagerElement = (
    <ModalManager
      activeModal={editorModal.activeModal}
      editorModal={editorModal}
      showExport={workspace.showExport}
      exportTarget={workspace.exportTarget}
      modeAssets={workspace.modeAssets}
      modeCoverage={workspace.modeCoverage}
      pageCoverage={workspace.pageCoverage}
      outputDpi={workspace.outputDpi}
      pageRange={workspace.pageRange}
      pageCount={workspace.selection.pages.length}
      pageError={workspace.selection.error || undefined}
      preflight={workspace.preflight}
      exportBusy={workspace.exporting || !!workspace.batchProgress}
      exportProgress={workspace.pdfProgress ?? workspace.pngProgress ?? (workspace.batchProgress ? { completed: workspace.batchProgress.finished, total: workspace.batchProgress.total } : null)}
      error={project.error}
      notice={project.notice}
      onDpi={dpi => {
        if (modeConfig) {
          setSettings(old => ({ ...old, printModeConfig: { ...modeConfig, dpi } }));
        } else {
          updateSetting("pdfDpi", dpi);
        }
      }}
      onPages={workspace.setPageRange}
      onCloseExport={() => workspace.setShowExport(false)}
      onCancelExport={workspace.cancelExports}
      onExportPdf={() => void workspace.handleExport()}
      onExportPng={item => void workspace.handlePngExport(item)}
      onExportZip={() => void workspace.handleBatchExport()}
      showPreferences={editorModal.showPreferences}
      userPrefs={userPrefs}
      customPapers={customPapers}
      onPaperLibraryChange={onPaperLibraryChange}
      onSavePreferences={onSavePreferences}
    />
  );

  if (editorModal.activeModal) {
    return modalManagerElement;
  }

  return (
    <div className="app-shell">
      {!project.hydrated && (
        <div className="workspace-restore-overlay" role="status">
          Restoring local workspace…
        </div>
      )}
      <span className="visually-hidden" role="status" aria-label="Session recovery status">
        {project.checkpointStatus === "saving" ? "Saving locally…" :
         project.checkpointStatus === "saved" ? "Saved locally" :
         project.checkpointStatus === "failed" ? "Save failed" :
         "Private by design"}
      </span>
      <AppHeader
        canUndo={project.historyCount.undo > 0}
        canRedo={project.historyCount.redo > 0}
        isPreferencesOpen={editorModal.showPreferences}
        mobileView={editorModal.mobileView}
        hasAssets={assets.length > 0}
        isExporting={workspace.exporting || !!workspace.batchProgress}
        fileInputRef={fileInputRef}
        onUndo={() => project.travel("undo")}
        onRedo={() => project.travel("redo")}
        onTogglePreferences={() => editorModal.showPreferences ? editorModal.closeOverlay() : editorModal.openPreferences()}
        onToggleModesView={() => editorModal.navigateView(editorModal.mobileView === "modes" ? "preview" : "modes")}
        onOpenExport={() => {
          workspace.setExportTarget({ format: "pdf" });
          workspace.setShowExport(true);
        }}
        onFileChange={onFileChange}
      />
      {modalManagerElement}
      {mobileView==="modes" ? (
        <PrintModeWorkspace
          assets={assets}
          config={modeConfig ?? undefined}
          customPapers={customPapers}
          coverage={modeCoverage}
          previews={previews}
          defaultPaper={{
            paper: userPrefs.defaultPaper,
            customWidthMm: userPrefs.defaultCustomWidthMm ?? 210,
            customHeightMm: userPrefs.defaultCustomHeightMm ?? 297,
          }}
          onConfig={value => setSettings(old => ({
            ...old,
            printModeConfig: value,
            notepadPreset: undefined,
            manualPlacements: [],
          }))}
          onPreview={() => editorModal.navigateView("preview")}
          onImages={() => editorModal.navigateView("images")}
        />
      ) : <>
      <div className="workspace" data-mobile-view={mobileView}>
        <AppSidebar
          modeConfig={modeConfig}
          modeLabel={modeLabel}
          settings={settings}
          customPapers={customPapers}
          assets={assets}
          userPrefs={userPrefs}
          notepadInfo={workspace.notepadInfo}
          presetName={project.presetName}
          savedPresets={project.savedPresets}
          presetDropdownId={presetDropdownId}
          chosenLayout={chosenLayout}
          chosenLayoutApplied={chosenLayoutApplied}
          matchingLayout={matchingLayout}
          recording={project.recording}
          recordedSteps={project.recordedSteps}
          projectName={project.projectName}
          projectId={project.projectId}
          autoSaveStatus={project.autoSaveStatus}
          recoveryList={project.recoveryList}
          selectedProject={project.selectedProject}
          projectList={project.projectList}
          projectBusy={project.projectBusy}
          visibleTrash={visibleTrash}
          backupInputRef={backupInputRef}
          isExporting={workspace.exporting || !!workspace.batchProgress}
          onUpdateSetting={updateSetting}
          onApplyPaperSelection={project.applyPaperSelection}
          onSelectNotepadPreset={project.selectNotepadPreset}
          enableAutomaticCopies={project.enableAutomaticCopies}
          handleCalibration={workspace.handleCalibration}
          setPresetName={name => project.setPresetName(name)}
          savePreset={project.savePreset}
          setSelectedPreset={id => project.setSelectedPreset(id)}
          loadPreset={project.loadPreset}
          removePreset={project.removePreset}
          setRecording={r => project.setRecording(r)}
          setRecordedSteps={steps => project.setRecordedSteps(steps)}
          onWorkflowApply={(wSettings, wAssets, notes) => {
            project.rememberEdit();
            setSettings(wSettings);
            project.setAssets(wAssets);
            if (notes.length) project.setNotice(notes.join(" "));
          }}
          setProjectName={name => project.setProjectName(name)}
          saveCurrentProject={project.saveCurrentProject}
          restoreUnsavedDraft={project.restoreUnsavedDraft}
          discardUnsavedDraft={project.discardUnsavedDraft}
          setSelectedProject={id => project.setSelectedProject(id)}
          refreshProjectList={project.refreshProjectList}
          openSavedProject={project.openSavedProject}
          removeSavedProject={project.removeSavedProject}
          startNewProject={project.startNewProject}
          restoreFromTrash={project.restoreFromTrash}
          deleteTrashPermanently={project.deleteTrashPermanently}
          exportPortableBackup={project.exportPortableBackup}
          handleBackupFile={onBackupFile}
          navigateView={editorModal.navigateView}
          setError={err => project.setError(err)}
        />
        <main
          className={"main-content" + (workspace.previewExpanded ? " preview-expanded" : "") + (selectedImage && !arrangeMode ? " has-image-settings" : "")}
          onDragOver={event => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className="content-heading">
            <div>
              <h1>{modeConfig ? modeLabel + " Preview" : "Workspace"}</h1>
              <p>{assets.length ? "Preview your print sheets" : "Drop images to start a new print"}</p>
            </div>
            <div className="preview-heading-actions">
              {assets.length > 0 && (
                <details ref={printCheckRef} className="preflight-panel preflight-compact">
                  <summary
                    aria-label={formatPreviewCheckStatus(preflight.errors.length,preflight.warnings.length)}
                    title={formatPreviewCheckStatus(preflight.errors.length,preflight.warnings.length)}
                  >
                    <StudioIcon name="preflight" size={20} />
                    <span
                      className={
                        "preflight-indicator " +
                        (preflight.errors.length
                          ? "preflight-error"
                          : preflight.warnings.length
                          ? "preflight-warning"
                          : "preflight-ok")
                      }
                      aria-hidden="true"
                    >
                      {preflight.errors.length+preflight.warnings.length||null}
                    </span>
                  </summary>
                  <div className="preflight-body">
                    {workspace.preflight.errors.map((item, i) => (
                      <div className="preflight-issue" key={"err-" + item.code + i}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </div>
                    ))}
                    {workspace.preflight.warnings.map((item, i) => (
                      <div className="preflight-issue" key={"warn-" + item.code + i}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </div>
                    ))}
                    {!workspace.preflight.errors.length && !workspace.preflight.warnings.length && (
                      <p className="hint">
                        Layout, crop geometry and image resolution checks passed. Print at 100% / Actual Size.
                      </p>
                    )}
                  </div>
                </details>
              )}
              <button
                className="primary-button subtle add-images-action"
                aria-label="Add images"
                title="Add images"
                onClick={() => fileInputRef.current?.click()}
              >
                <StudioIcon name="upload" size={17} />
                <span className="add-images-label">Add images</span>
              </button>
            </div>
          </div>
          {(project.error && !workspace.showExport || workspace.result.message || project.notice && !workspace.showExport) && (
            <div className={"workspace-message-stack" + (project.notice && !project.error && !workspace.result.message ? " notice-only" : "")}>
              {project.error && !workspace.showExport && <p className="banner danger" role="alert">{project.error}</p>}
              {workspace.result.message && <p className="banner danger" role="alert">{workspace.result.message}</p>}
              {project.notice && !workspace.showExport && (
                <p className="banner success" role="status">
                  <span className="notice-copy">{project.notice}</span>
                  <button
                    type="button"
                    className="notice-dismiss"
                    aria-label="Dismiss notice"
                    onClick={() => project.setNotice("")}
                  >
                    <StudioIcon name="close" size={15} />
                  </button>
                </p>
              )}
            </div>
          )}
          {modeConfig && modeAssets.some(asset => workspace.modeRasterErrors[asset.id]?.key === cropPreviewKey(asset)) && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                project.setError("");
                workspace.retryModePreviews();
              }}
            >
              Retry mode-sized image previews
            </button>
          )}
          {!modeConfig && assets.some(asset => workspace.previewFailures[asset.id]?.key === cropPreviewKey(asset)) && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                project.setError("");
                workspace.retryFailedPreviews();
              }}
            >
              Retry failed image previews
            </button>
          )}
          {assets.length === 0 ? (
            <div
              className="empty-state"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={event => {
                if (event.key === "Enter") fileInputRef.current?.click();
              }}
              role="button"
              tabIndex={0}
            >
              <div className="empty-icon" aria-hidden="true">
                <img src="/mark.svg" alt="" />
              </div>
              <h2>Start with an image</h2>
              <p>Drop a photo here or browse files</p>
              <small>JPG · PNG · WebP</small>
            </div>
          ) : (
            <>
              {workspace.result.pages.length > 0 ? (
                <>
                  <nav
                    className={"sheet-navigation"+(!modeConfig&&arrangeMode?" is-arranging":"")}
                    aria-label="Preview sheet navigation"
                  >
                    {!modeConfig && (
                      <button
                        className={"secondary-button" + (arrangeMode && !settings.notepadPreset ? " active-arrange" : "")}
                        aria-pressed={arrangeMode && !settings.notepadPreset}
                        disabled={!!settings.notepadPreset}
                        aria-label={arrangeMode?"Finish arranging copies":"Arrange copies"}
                        title={
                          settings.notepadPreset
                            ? "Notepad cells must stay aligned to the cutting grid."
                            : "Drag an individual copy or use arrow keys to change its print position."
                        }
                        onClick={() => workspace.setArrangeMode(mode => !mode)}
                      >
                        <StudioIcon name="arrange" size={16} />
                        <span className="sheet-arrange-text">{arrangeMode ? "Done arranging" : "Arrange copies"}</span>
                      </button>
                    )}
                    {!modeConfig && arrangeMode && (
                      <button
                        className="secondary-button"
                        aria-label="Reset sheet arrangement"
                        title="Reset sheet arrangement"
                        disabled={!settings.manualPlacements?.length}
                        onClick={workspace.resetSheetArrangement}
                      >
                        <StudioIcon name="reset" size={16} />
                        <span className="sheet-reset-text">Reset</span>
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      disabled={safePreviewIndex === 0}
                      onClick={() => workspace.setPreviewIndex(i => Math.max(0, i - 1))}
                      aria-label="Previous sheet"
                    >
                      <StudioIcon name="left" size={17} />
                    </button>
                    <span
                      className="sheet-nav-label"
                      aria-label={`Sheet ${safePreviewIndex+1} of ${result.pages.length}`}
                    >
                      <span className="sheet-nav-long" aria-hidden="true">
                        Sheet {safePreviewIndex + 1} of {result.pages.length}
                      </span>
                      <span className="sheet-nav-compact" aria-hidden="true">
                        {safePreviewIndex + 1} / {result.pages.length}
                      </span>
                    </span>
                    <button
                      className="secondary-button"
                      disabled={safePreviewIndex >= result.pages.length - 1}
                      onClick={() => workspace.setPreviewIndex(i => Math.min(result.pages.length - 1, i + 1))}
                      aria-label="Next sheet"
                    >
                      <StudioIcon name="right" size={17} />
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        workspace.setPageRange(String(safePreviewIndex + 1));
                        workspace.setShowExport(true);
                      }}
                      aria-label="Export this sheet"
                      title="Choose just this sheet for PDF export"
                    >
                      <StudioIcon name="download" size={17} />
                      <span className="sheet-export-label">Export this sheet</span>
                    </button>
                    <button
                      className="secondary-button preview-expand-toggle"
                      type="button"
                      onClick={() => setPreviewExpanded(value => !value)}
                      aria-pressed={previewExpanded}
                      aria-label={previewExpanded?"Exit enlarged preview":"Enlarge print preview"}
                      title={previewExpanded?"Exit enlarged preview":"Enlarge print preview"}
                    >
                      <StudioIcon name={previewExpanded ? "collapse" : "expand"} size={17} />
                    </button>
                  </nav>
                  <div className="preview-grid">
                    <SheetPreview
                      key={safePreviewIndex}
                      page={result.pages[safePreviewIndex]}
                      paper={paper}
                      paperLabel={(modeConfig?.paper??settings.paper)==="Custom"
                        ?`${Math.round(paper.widthMm*10)/10}×${Math.round(paper.heightMm*10)/10} mm`
                        :(modeConfig?.paper??settings.paper)}
                      orientation={modeConfig?.orientation??settings.orientation}
                      sheetCount={result.pages.length} totalCopies={totalCopies}
                      printCoverage={modeCoverage?modeCoverage.printed+"/"+modeCoverage.uploaded+" designs":undefined}
                      items={modeAssets} previews={modeConfig?modePreviews:previews}
                      guides={modeConfig?.cutGuides??settings.cutGuides}
                      trimStyle={modeConfig?"outline":settings.trimStyle??"outline"}
                      index={safePreviewIndex} arrange={!modeConfig&&workspace.arrangeMode&&!settings.notepadPreset}
                      onMove={workspace.moveOnSheet} onRotate={workspace.rotateOnSheet}
                      marginMm={modeConfig?.marginMm??settings.marginMm}
                      notepadCuts={modeConfig?modeJob?.cuts:notepadCuts}
                      selectedCopy={selectedImage && !arrangeMode ? {
                        itemId: selectedImage.placement.itemId,
                        copyIndex: selectedImage.placement.copyIndex,
                      } : null}
                      onSelectCopy={(itemId, copyIndex) => setPreviewSelection({ pageIndex: safePreviewIndex, itemId, copyIndex })}
                    />
                  </div>
                    {selectedImage && !arrangeMode && (
                      <QuickImageSettings
                        key={selectedImage.asset.id}
                        item={selectedImage.asset}
                        placement={selectedImage.placement}
                        previewUrl={(modeConfig ? modePreviews : previews)[selectedImage.asset.id]}
                        modeConfig={modeConfig}
                        unit={userPrefs.unit}
                        canRotateCopy={!modeConfig && !settings.notepadPreset && !(selectedImage.asset.layers ?? []).some(layer => layer.visible)}
                        onChange={project.updateItem}
                        onOpenEditor={editorModal.openEditor}
                        onRotateCopy={() => workspace.rotateOnSheet(selectedImage.placement.itemId, selectedImage.placement.copyIndex)}
                        onDuplicate={() => project.duplicateItem(selectedImage.asset)}
                        onDownload={() => {
                          workspace.setExportTarget({ format: "png", id: selectedImage.asset.id });
                          workspace.setShowExport(true);
                        }}
                        onOpenImages={() => editorModal.navigateView("images")}
                        onClose={() => setPreviewSelection(null)}
                      />
                    )}
                </>
              ) : (
                <p className="banner danger" role="status">
                  No printable sheets are available. Check image dimensions, copy counts and paper settings.
                </p>
              )}
            </>
          )}
          <p className="print-hint">
            Print at <strong>100% / Actual Size</strong>{" "}
            <HelpTip
              label="Print scaling help"
              text="Use Actual Size or 100% in your PDF reader. Fit to Page may change physical print dimensions."
            />
          </p>
        </main>
        <AppItemsSidebar
          assets={assets}
          previews={previews}
          userPrefs={userPrefs}
          settings={settings}
          paper={paper}
          modeConfig={modeConfig}
          modeCoverage={modeCoverage}
          batchProgress={workspace.batchProgress}
          isExporting={workspace.exporting || !!workspace.batchProgress}
          onUpdateItem={project.updateItem}
          onRemoveItem={item => void project.removeItem(item)}
          onDuplicateItem={project.duplicateItem}
          onOpenEditor={(editor, assetId) => editorModal.openEditor(editor, assetId)}
          onOpenDownloadPng={assetId => {
            workspace.setExportTarget({ format: "png", id: assetId });
            workspace.setShowExport(true);
          }}
          onSelectNotepadPreset={project.selectNotepadPreset}
          onBatchExport={workspace.handleBatchExport}
          onCancelBatchExport={workspace.cancelExports}
          onModeConfigChange={cfg => setSettings(old => ({ ...old, printModeConfig: cfg }))}
        />
      </div>
    </>}
    <nav className="mobile-tabs" aria-label="Mobile workspace navigation">
      <button
        type="button"
        className={editorModal.mobileView === "modes" ? "active" : ""}
        aria-current={editorModal.mobileView === "modes" ? "page" : undefined}
        onClick={() => editorModal.navigateView("modes")}
      >
        <StudioIcon name="presets" size={21} />
        <span>Modes</span>
      </button>
      <button
        type="button"
        className={editorModal.mobileView === "preview" ? "active" : ""}
        aria-current={editorModal.mobileView === "preview" ? "page" : undefined}
        onClick={() => editorModal.navigateView("preview")}
      >
        <StudioIcon name="preview" size={21} />
        <span>Preview</span>
      </button>
      <button
        type="button"
        className={editorModal.mobileView === "images" ? "active" : ""}
        aria-current={editorModal.mobileView === "images" ? "page" : undefined}
        onClick={() => editorModal.navigateView("images")}
      >
        <StudioIcon name="images" size={21} />
        <span>Images</span>
      </button>
      <button
        type="button"
        className={editorModal.mobileView === "print" ? "active" : ""}
        aria-current={editorModal.mobileView === "print" ? "page" : undefined}
        onClick={() => editorModal.navigateView("print")}
      >
        <StudioIcon name="print" size={21} />
        <span>Print</span>
      </button>
    </nav>
    </div>
  );
}
