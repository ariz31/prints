import type { ChangeEvent, RefObject } from "react";
import type { WorkspaceView } from "../navigation/appNavigation.ts";
import StudioIcon from "../../components/StudioIcon.tsx";

export interface AppHeaderProps {
  canUndo: boolean;
  canRedo: boolean;
  isPreferencesOpen: boolean;
  mobileView: WorkspaceView;
  hasAssets: boolean;
  isExporting: boolean;
  exporting?: boolean;
  batchProgress?: boolean | object | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePreferences: () => void;
  onToggleModesView: () => void;
  onOpenExport: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function AppHeader({
  canUndo,
  canRedo,
  isPreferencesOpen,
  mobileView,
  hasAssets,
  isExporting,
  exporting = isExporting,
  batchProgress = null,
  fileInputRef,
  onUndo,
  onRedo,
  onTogglePreferences,
  onToggleModesView,
  onOpenExport,
  onFileChange,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <img src="/wordmark.svg" className="brand-wordmark" alt="PRINTS" width="765" height="230" />
        <small>Print studio</small>
      </div>
      <div className="history-tools" role="group" aria-label="Undo and redo">
        <button
          className="header-icon"
          disabled={!canUndo}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo edit"
          onClick={onUndo}
        >
          <StudioIcon name="undo" size={18} />
        </button>
        <button
          className="header-icon"
          disabled={!canRedo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo edit"
          onClick={onRedo}
        >
          <StudioIcon name="redo" size={18} />
        </button>
      </div>
      <button
        className="header-icon"
        onClick={onTogglePreferences}
        aria-label="Preferences"
        title="Preferences"
        aria-expanded={isPreferencesOpen}
      >
        <StudioIcon name="settings" size={19} />
      </button>
      <button
        className={"secondary-button mode-launch desktop-mode-launch" + (mobileView === "modes" ? " mode-launch-active" : "")}
        onClick={onToggleModesView}
      >
        <StudioIcon name="print" size={17} />
        {mobileView === "modes" ? "Classic workspace" : "Print Modes"}
      </button>
      {mobileView !== "modes" && (
        <button
          className="primary-button header-export-action"
          aria-label={exporting||batchProgress?"Exporting print job":"Export and print"}
          title="Export and print"
          onClick={onOpenExport}
          disabled={!hasAssets}
        >
          <StudioIcon name="download" size={17} />
          <span className="header-export-label">{isExporting ? "Exporting…" : "Export & print"}</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={onFileChange}
        aria-label="Upload image files"
      />
    </header>
  );
}

export default AppHeader;
