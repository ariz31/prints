import type { PhotoAsset } from "../../domain/models/asset.ts";
import type { ProjectSettings as Preferences } from "../../domain/models/project.ts";
import type { PrintModeConfig } from "../../domain/models/printMode.ts";
import type { ModeImageCoverage } from "../controllers/workspaceController.ts";
import type { UserPreferences } from "../../domain/models/preferences.ts";
import type { NotepadPresetId } from "../../features/sheet-composer/logic/notepadLayout.ts";
import type { EditorView } from "../navigation/appNavigation.ts";
import StudioIcon from "../../components/StudioIcon.tsx";
import { PrintModeImageAssignments } from "../../components/PrintModeWorkspace.tsx";
import AssetCard from "./AssetCard.tsx";

export interface AppItemsSidebarProps {
  assets: readonly PhotoAsset[];
  previews: Record<string, string>;
  userPrefs: UserPreferences;
  settings: Preferences;
  paper: { widthMm: number; heightMm: number };
  modeConfig: PrintModeConfig | null;
  modeCoverage?: ModeImageCoverage;
  batchProgress: { finished: number; total: number } | null;
  isExporting: boolean;

  onUpdateItem: (asset: PhotoAsset) => void;
  onRemoveItem: (asset: PhotoAsset) => Promise<void> | void;
  onDuplicateItem: (asset: PhotoAsset) => void;
  onOpenEditor: (editor: EditorView, assetId: string) => void;
  onOpenDownloadPng: (assetId: string) => void;
  onSelectNotepadPreset: (preset: NotepadPresetId | undefined) => void;
  onBatchExport: () => Promise<void> | void;
  onCancelBatchExport: () => void;
  onModeConfigChange: (config: PrintModeConfig) => void;
}

export function AppItemsSidebar({
  assets,
  previews,
  userPrefs,
  settings,
  paper,
  modeConfig,
  modeCoverage,
  batchProgress,
  isExporting,
  onUpdateItem,
  onRemoveItem,
  onDuplicateItem,
  onOpenEditor,
  onOpenDownloadPng,
  onSelectNotepadPreset,
  onBatchExport,
  onCancelBatchExport,
  onModeConfigChange,
}: AppItemsSidebarProps) {
  return (
    <aside className="items-sidebar">
      <div className="panel-heading">
        <h2 className="panel-title-with-icon">
          <StudioIcon name="images" size={18} />
          <span>Images</span>
        </h2>
        <p>{assets.length}</p>
      </div>

      {modeConfig && (
        <PrintModeImageAssignments
          assets={assets as PhotoAsset[]}
          config={modeConfig}
          compact
          coverage={modeCoverage}
          previews={previews}
          onConfig={onModeConfigChange}
        />
      )}

      {assets.length > 0 && (
        <div className="batch-actions">
          <button
            className="secondary-button"
            disabled={!!batchProgress || isExporting}
            title="Export each design at the chosen DPI. Very large jobs may exceed local device or ZIP limits."
            onClick={() => void onBatchExport()}
          >
            <StudioIcon name="download" size={16} />
            {modeConfig ? "Export included designs (ZIP)" : "Export all designs (ZIP)"}
          </button>
          {batchProgress && (
            <>
              <span className="hint" role="status">
                {batchProgress.finished}/{batchProgress.total} designs
              </span>
              <button className="secondary-button" onClick={onCancelBatchExport}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {assets.length === 0 && <p className="hint padded">Add an image to edit.</p>}

      <div className="asset-list">
        {assets.map(item => (
          <AssetCard
            key={item.id}
            item={item}
            previewUrl={previews[item.id]}
            unit={userPrefs.unit}
            orientation={settings.orientation}
            paper={paper}
            modeQuantityOverride={!!modeConfig}
            modeSizingOverride={!!modeConfig && modeConfig.mode !== "normal"}
            notepadPreset={modeConfig ? undefined : settings.notepadPreset}
            canUseNotepad={!modeConfig && assets.length === 1}
            onNotepadChange={onSelectNotepadPreset}
            onChange={onUpdateItem}
            onAdjust={() => onOpenEditor("adjust", item.id)}
            onId={() => onOpenEditor("id", item.id)}
            onCrop={() => onOpenEditor("crop", item.id)}
            onBackground={() => onOpenEditor("background", item.id)}
            onLayers={() => onOpenEditor("layers", item.id)}
            onDownload={() => onOpenDownloadPng(item.id)}
            onDuplicate={() => onDuplicateItem(item)}
            onRemove={() => void onRemoveItem(item)}
          />
        ))}
      </div>
    </aside>
  );
}

export default AppItemsSidebar;
