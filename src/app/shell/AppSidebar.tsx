import type { ChangeEvent, RefObject } from "react";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import type { ProjectSettings as Preferences, ProjectSummary, TrashSummary } from "../../domain/models/project.ts";
import type { PrintModeConfig } from "../../domain/models/printMode.ts";
import type { CustomPaperSize } from "../../features/paper-sizes/logic/paperLibrary.ts";
import type { PaperSelection } from "../../features/paper-sizes/components/PaperSizePicker.tsx";
import type { UserPreferences } from "../../domain/models/preferences.ts";
import type { NamedPreset } from "../../features/photo-editor/logic/presetLibrary.ts";
import type { WorkflowStep } from "../../features/projects/logic/workflow.ts";
import type { RecoverySummary } from "../../features/projects/logic/draftRecovery.ts";
import type { NotepadPresetId, CutGrid } from "../../features/sheet-composer/logic/notepadLayout.ts";
import { NOTEPAD_PRESETS } from "../../features/sheet-composer/logic/notepadLayout.ts";
import type { WorkspaceView } from "../navigation/appNavigation.ts";
import type { Orientation, TrimStyle } from "../../domain/models/sheet.ts";
import StudioIcon from "../../components/StudioIcon.tsx";
import StudioSelect from "../../components/StudioSelect.tsx";
import HelpTip from "../../components/HelpTip.tsx";
import DimensionField from "../../components/DimensionField.tsx";
import PaperSizePicker from "../../components/PaperSizePicker.tsx";
import { PrintModeSettings } from "../../components/PrintModeWorkspace.tsx";
import WorkflowPanel from "../../components/WorkflowPanel.tsx";

export interface AppSidebarProps {
  modeConfig: PrintModeConfig | null;
  modeLabel: string;
  settings: Preferences;
  customPapers: CustomPaperSize[];
  assets: readonly PhotoAsset[];
  userPrefs: UserPreferences;
  notepadInfo: CutGrid | null;
  presetName: string;
  savedPresets: readonly NamedPreset[];
  presetDropdownId: string;
  chosenLayout?: NamedPreset;
  chosenLayoutApplied: boolean;
  matchingLayout?: NamedPreset;
  recording: boolean;
  recordedSteps: readonly WorkflowStep[];
  projectName: string;
  projectId: string | null;
  autoSaveStatus: "idle" | "saving" | "saved" | "failed";
  recoveryList: readonly RecoverySummary[];
  selectedProject: string;
  projectList: readonly ProjectSummary[];
  projectBusy: boolean;
  visibleTrash: readonly TrashSummary[];
  backupInputRef: RefObject<HTMLInputElement | null>;
  isExporting: boolean;

  onUpdateSetting: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onApplyPaperSelection: (selection: PaperSelection) => void;
  onSelectNotepadPreset: (preset: NotepadPresetId | undefined) => void;
  enableAutomaticCopies: () => void;
  handleCalibration: () => Promise<void> | void;
  setPresetName: (name: string) => void;
  savePreset: () => void;
  setSelectedPreset: (id: string) => void;
  loadPreset: () => void;
  removePreset: () => void;
  setRecording: (recording: boolean) => void;
  setRecordedSteps: (steps: WorkflowStep[]) => void;
  onWorkflowApply: (settings: Preferences, assets: PhotoAsset[], notes: string[]) => void;
  setProjectName: (name: string) => void;
  saveCurrentProject: () => Promise<void> | void;
  restoreUnsavedDraft: (id: string) => Promise<void> | void;
  discardUnsavedDraft: (id: string) => Promise<void> | void;
  setSelectedProject: (id: string) => void;
  refreshProjectList: () => Promise<void>;
  openSavedProject: () => Promise<void> | void;
  removeSavedProject: () => Promise<void> | void;
  startNewProject: () => void;
  restoreFromTrash: (entry: TrashSummary) => Promise<void> | void;
  deleteTrashPermanently: (entry: TrashSummary) => Promise<void> | void;
  exportPortableBackup: () => Promise<void> | void;
  handleBackupFile: (event: ChangeEvent<HTMLInputElement>) => void;
  navigateView: (view: WorkspaceView) => void;
  setError: (error: string) => void;
}

export function AppSidebar({
  modeConfig,
  modeLabel,
  settings,
  customPapers,
  assets,
  userPrefs,
  notepadInfo,
  presetName,
  savedPresets,
  presetDropdownId,
  chosenLayout,
  chosenLayoutApplied,
  matchingLayout,
  recording,
  recordedSteps,
  projectName,
  projectId,
  autoSaveStatus,
  recoveryList,
  selectedProject,
  projectList,
  projectBusy,
  visibleTrash,
  backupInputRef,
  isExporting,
  onUpdateSetting,
  onApplyPaperSelection,
  onSelectNotepadPreset,
  enableAutomaticCopies,
  handleCalibration,
  setPresetName,
  savePreset,
  setSelectedPreset,
  loadPreset,
  removePreset,
  setRecording,
  setRecordedSteps,
  onWorkflowApply,
  setProjectName,
  saveCurrentProject,
  restoreUnsavedDraft,
  discardUnsavedDraft,
  setSelectedProject,
  refreshProjectList,
  openSavedProject,
  removeSavedProject,
  startNewProject,
  restoreFromTrash,
  deleteTrashPermanently,
  exportPortableBackup,
  handleBackupFile,
  navigateView,
  setError,
}: AppSidebarProps) {
  return (
    <aside className="sidebar">
      {modeConfig ? (
        <>
          <div className="panel-heading">
            <h2 className="panel-title-with-icon">
              <StudioIcon name="presets" size={18} />
              <span>{modeLabel} settings</span>
            </h2>
          </div>
          <PrintModeSettings
            config={modeConfig}
            customPapers={customPapers}
            assets={assets as PhotoAsset[]}
            onConfig={value => onUpdateSetting("printModeConfig", value)}
          />
          <div className="panel-section">
            <button className="secondary-button" onClick={() => navigateView("modes")}>
              <StudioIcon name="presets" size={16} />
              Change print mode
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="panel-heading">
            <h2 className="panel-title-with-icon">
              <StudioIcon name="print" size={18} />
              <span>Print setup</span>
            </h2>
            <HelpTip
              label="Print setup help"
              text="Choose your paper and orientation here. Units and defaults can be changed in Preferences."
            />
          </div>
          <div className="panel-section compact-print">
            <div className="print-field paper-picker-field">
              <span className="field-label">
                <StudioIcon name="paper" size={15} />
                Paper
              </span>
              <PaperSizePicker
                paper={settings.paper}
                customWidthMm={settings.customWidthMm}
                customHeightMm={settings.customHeightMm}
                customPapers={customPapers}
                onSelect={onApplyPaperSelection}
              />
            </div>
            <label className="print-field">
              <span className="field-label">
                <StudioIcon name={settings.orientation === "portrait" ? "portrait" : "orientation"} size={15} />
                Orientation
              </span>
              <StudioSelect
                value={settings.orientation}
                onChange={event => onUpdateSetting("orientation", event.target.value as Orientation)}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </StudioSelect>
            </label>
            <label className="print-field">
              <span className="field-label">
                <StudioIcon name="presets" size={15} />
                Notepad cutting
              </span>
              <StudioSelect
                aria-label="Notepad cutting preset"
                value={settings.notepadPreset ?? ""}
                onChange={event =>
                  onSelectNotepadPreset(event.target.value ? (event.target.value as NotepadPresetId) : undefined)
                }
              >
                <option value="">Off · regular print layout</option>
                {NOTEPAD_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {settings.orientation === "portrait" ? p.columns : p.rows} ×{" "}
                    {settings.orientation === "portrait" ? p.rows : p.columns} cut grid
                  </option>
                ))}
              </StudioSelect>
            </label>
            {notepadInfo && (
              <p className="hint" aria-live="polite">
                {notepadInfo.copiesPerSheet} equal pieces · {notepadInfo.cutLines} shared straight cut lines · cut size{" "}
                {notepadInfo.cellWidthMm.toFixed(2)} × {notepadInfo.cellHeightMm.toFixed(2)} mm · printable design{" "}
                {notepadInfo.artWidthMm.toFixed(2)} × {notepadInfo.artHeightMm.toFixed(2)} mm. Margin is a per-piece artwork
                inset; cuts use the full selected sheet. Print at 100% / Actual Size.
              </p>
            )}
            {(settings.notepadPreset || settings.packing === "optimized") && assets.length === 1 && (
              <div className="action-stack">
                <p className="hint" role="status">
                  Copy count:{" "}
                  {settings.copyMode === "automatic" ? "Automatic sheet-fill" : "Manual override (preserved)"}
                </p>
                {settings.copyMode !== "automatic" && (
                  <button className="secondary-button" onClick={enableAutomaticCopies}>
                    Auto-fill copies
                  </button>
                )}
              </div>
            )}
            {settings.paper === "Custom" && (
              <div className="two-inputs">
                <DimensionField
                  label="Width"
                  unit={userPrefs.unit}
                  valueMm={settings.customWidthMm}
                  onCommit={v => onUpdateSetting("customWidthMm", v)}
                />
                <DimensionField
                  label="Height"
                  unit={userPrefs.unit}
                  valueMm={settings.customHeightMm}
                  onCommit={v => onUpdateSetting("customHeightMm", v)}
                />
              </div>
            )}
            <div className="two-inputs">
              <DimensionField
                label="Margin"
                unit={userPrefs.unit}
                minMm={0}
                maxMm={1999.999}
                valueMm={settings.marginMm}
                onCommit={v => onUpdateSetting("marginMm", v)}
              />
              {!settings.notepadPreset && (
                <DimensionField
                  label="Gap"
                  unit={userPrefs.unit}
                  minMm={0}
                  maxMm={1999.999}
                  valueMm={settings.gapMm}
                  onCommit={v => onUpdateSetting("gapMm", v)}
                />
              )}
            </div>
            <details className="advanced-options">
              <summary>
                <span className="disclosure-label">
                  <StudioIcon name="advanced" size={17} />
                  <span>Advanced settings</span>
                </span>
                <StudioIcon name="chevron" size={16} className="disclosure-chevron" />
              </summary>
              <label title="Compact groups compatible sizes to reduce sheet count. Source order preserves item order.">
                Sheet arrangement
                <StudioSelect
                  value={settings.packing ?? "compact"}
                  onChange={event =>
                    onUpdateSetting("packing", event.target.value as "compact" | "ordered" | "optimized")
                  }
                >
                  <option value="compact">Compact (shelf)</option>
                  <option value="optimized">Optimized (mixed-size)</option>
                  <option value="ordered">Source order</option>
                </StudioSelect>
              </label>
              {settings.packing === "optimized" && (
                <label title="Rotate photo-only designs by 90° when it saves paper; text and shape layers remain upright.">
                  <input
                    type="checkbox"
                    checked={settings.autoRotate ?? false}
                    onChange={event => onUpdateSetting("autoRotate", event.target.checked)}
                  />
                  Allow safe photo rotation
                </label>
              )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={settings.cutGuides}
                  onChange={event => onUpdateSetting("cutGuides", event.target.checked)}
                />{" "}
                Cut lines
              </label>
              {settings.cutGuides && (
                <label title="Outlines trace each product. Corner marks sit outside the design, in reserved paper whitespace.">
                  Cut-mark style
                  <StudioSelect
                    value={settings.trimStyle ?? "outline"}
                    onChange={event => onUpdateSetting("trimStyle", event.target.value as TrimStyle)}
                  >
                    <option value="outline">Product outlines</option>
                    <option value="corner">Corner cutting marks</option>
                  </StudioSelect>
                </label>
              )}
              <button
                className="secondary-button"
                disabled={isExporting}
                title="Export a measured reference sheet to test your printer's actual output size."
                onClick={() => void handleCalibration()}
              >
                <StudioIcon name="ruler" size={16} />
                Calibration PDF
              </button>
            </details>
          </div>
          <details className="disclosure-panel">
            <summary>
              <span className="disclosure-label">
                <StudioIcon name="presets" size={17} />
                <span>Layout presets</span>
                <small className="selection-summary">
                  {matchingLayout?.name ?? (chosenLayout ? "Custom / modified" : "Custom")}
                </small>
              </span>
              <StudioIcon name="chevron" size={16} className="disclosure-chevron" />
            </summary>
            <div className="panel-section">
              <label>
                Preset name
                <input
                  type="text"
                  value={presetName}
                  maxLength={80}
                  onChange={event => setPresetName(event.target.value)}
                />
              </label>
              <button className="secondary-button" onClick={savePreset}>
                <StudioIcon name="save" size={16} />
                Save current layout
              </button>
              <label>
                Saved layouts
                <StudioSelect value={presetDropdownId} onChange={event => setSelectedPreset(event.target.value)}>
                  <option value="">Select a layout…</option>
                  {savedPresets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </StudioSelect>
              </label>
              <p className="hint" role="status">
                {chosenLayout
                  ? chosenLayoutApplied
                    ? "Applied layout: " + chosenLayout.name
                    : "Selected layout: " +
                      chosenLayout.name +
                      " (not applied or modified)" +
                      (matchingLayout ? ". Current layout: " + matchingLayout.name : "")
                  : "Custom layout — no saved preset applied."}
              </p>
              <div className="action-stack">
                <button disabled={!presetDropdownId} className="secondary-button" onClick={loadPreset}>
                  <StudioIcon name="apply" size={16} />
                  Apply layout
                </button>
                <button disabled={!presetDropdownId} className="secondary-button" onClick={removePreset}>
                  <StudioIcon name="delete" size={16} />
                  Delete layout
                </button>
              </div>
            </div>
          </details>
        </>
      )}
      {!modeConfig && (
        <details className="disclosure-panel">
          <summary>
            <span className="disclosure-label">
              <StudioIcon name="workflows" size={17} />
              <span>Workflows</span>
            </span>
            <StudioIcon name="chevron" size={16} className="disclosure-chevron" />
          </summary>
          <WorkflowPanel
            settings={settings}
            assets={assets as PhotoAsset[]}
            recording={recording}
            recordedSteps={recordedSteps as WorkflowStep[]}
            onStartRecording={() => {
              setRecordedSteps([]);
              setRecording(true);
            }}
            onStopRecording={() => setRecording(false)}
            onApply={onWorkflowApply}
            onError={setError}
          />
        </details>
      )}
      <details className="disclosure-panel">
        <summary>
          <span className="disclosure-label">
            <StudioIcon name="projects" size={17} />
            <span>Projects</span>
          </span>
          <StudioIcon name="chevron" size={16} className="disclosure-chevron" />
        </summary>
        <section className="panel-section">
          <h3 className="visually-hidden">Saved projects</h3>
          <label>
            Project name
            <input
              type="text"
              maxLength={100}
              value={projectName}
              onChange={event => setProjectName(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={projectBusy} onClick={() => void saveCurrentProject()}>
            <StudioIcon name="save" size={16} />
            Save full project
          </button>
          {projectId && userPrefs.autoSave !== false && (
            <span className="hint" role="status">
              Autosave:{" "}
              {autoSaveStatus === "saving"
                ? "Saving…"
                : autoSaveStatus === "saved"
                ? "Saved"
                : autoSaveStatus === "failed"
                ? "Failed — use Save"
                : "Waiting for changes"}
            </span>
          )}
          {recoveryList.length > 0 && (
            <div className="action-stack" aria-label="Recover unsaved work">
              <p className="hint">
                Recoverable session checkpoints are stored only in this browser. Clearing site data can erase them.
              </p>
              {recoveryList.map(draft => (
                <div className="two-inputs" key={draft.id}>
                  <button
                    className="secondary-button"
                    disabled={projectBusy}
                    onClick={() => void restoreUnsavedDraft(draft.id)}
                  >
                    Recover {draft.images} images · {new Date(draft.updatedAt).toLocaleString()}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={projectBusy}
                    aria-label={"Discard recovered draft " + draft.id}
                    onClick={() => void discardUnsavedDraft(draft.id)}
                  >
                    Discard
                  </button>
                </div>
              ))}
            </div>
          )}
          <label>
            Open an existing project
            <StudioSelect value={selectedProject} onChange={event => setSelectedProject(event.target.value)}>
              <option value="">Select saved project</option>
              {projectList.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.itemCount} images)
                </option>
              ))}
            </StudioSelect>
          </label>
          <div className="action-stack">
            <button
              className="secondary-button"
              disabled={projectBusy}
              onClick={() => void refreshProjectList().catch(cause => setError(displayError(cause)))}
            >
              <StudioIcon name="refresh" size={16} />
              Refresh saved projects
            </button>
            <button
              className="secondary-button"
              disabled={!selectedProject || projectBusy}
              onClick={() => void openSavedProject()}
            >
              <StudioIcon name="open" size={16} />
              Open selected project
            </button>
            <button
              className="secondary-button"
              disabled={!selectedProject || projectBusy}
              onClick={() => void removeSavedProject()}
            >
              <StudioIcon name="delete" size={16} />
              Delete selected saved project
            </button>
            <button className="secondary-button" onClick={startNewProject}>
              <StudioIcon name="new" size={16} />
              New blank project
            </button>
            <details className="disclosure-panel">
              <summary>
                <span className="disclosure-label">
                  <StudioIcon name="delete" size={16} />
                  <span>Recently Deleted ({visibleTrash.length})</span>
                </span>
                <StudioIcon name="chevron" size={16} className="disclosure-chevron" />
              </summary>
              <section className="panel-section">
                <p className="hint">
                  Recovery copies stay on this device for up to 30 days. Clearing browser storage can remove them
                  sooner. Download backups for long-term safety.
                </p>
                {visibleTrash.length === 0 ? (
                  <p className="hint">No recoverable deletions.</p>
                ) : (
                  visibleTrash.map(entry => (
                    <div className="recovery-item" key={entry.id}>
                      <span>
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.kind === "project" ? "Saved project" : "Image / design"} ·{" "}
                          {new Date(entry.deletedAt).toLocaleDateString()}
                        </small>
                      </span>
                      <div className="recovery-actions">
                        <button
                          className="secondary-button"
                          disabled={projectBusy}
                          onClick={() => void restoreFromTrash(entry)}
                        >
                          Restore
                        </button>
                        <button
                          className="secondary-button"
                          disabled={projectBusy}
                          aria-label={"Delete recovery copy of " + entry.name + " permanently"}
                          onClick={() => void deleteTrashPermanently(entry)}
                        >
                          Delete permanently
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </details>

            <button
              className="secondary-button"
              disabled={projectBusy}
              onClick={() => void exportPortableBackup()}
            >
              <StudioIcon name="download" size={16} />
              Download portable backup
            </button>
            <button
              className="secondary-button"
              disabled={projectBusy}
              onClick={() => backupInputRef.current?.click()}
            >
              <StudioIcon name="import" size={16} />
              Import project backup
            </button>
            <input
              ref={backupInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,.prints.json,.zip,.prints.zip,application/json,application/zip"
              aria-label="Import PRINTS project backup"
              onChange={handleBackupFile}
            />
          </div>
          <p className="hint">
            Projects with source images are stored in this browser. Portable .prints.zip backups preserve original
            photos, crop settings, masks and layers with deduplicated files (up to 256 MiB of unique image data);
            legacy .prints.json files remain importable. Keep backups outside the browser to protect against data loss.
          </p>
        </section>
      </details>
    </aside>
  );
}

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export default AppSidebar;
