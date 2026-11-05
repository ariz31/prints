import { useState } from "react";
import type { PhotoAsset } from "../../../domain/models/asset.ts";
import type { Placement } from "../../../domain/models/sheet.ts";
import type { PrintModeConfig } from "../../../domain/models/printMode.ts";
import type { UserPreferences } from "../../../domain/models/preferences.ts";
import type { EditorView } from "../../../app/navigation/appNavigation.ts";
import StudioIcon, { type StudioIconName } from "../../../components/StudioIcon.tsx";
import DimensionField from "../../../components/DimensionField.tsx";
import SafeIntegerField from "../../../components/SafeIntegerField.tsx";

export interface QuickImageSettingsProps {
  item: PhotoAsset;
  placement: Placement;
  previewUrl?: string;
  modeConfig: PrintModeConfig | null;
  unit: UserPreferences["unit"];
  canRotateCopy: boolean;
  onChange: (item: PhotoAsset) => void;
  onOpenEditor: (editor: EditorView, assetId: string) => void;
  onRotateCopy: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onOpenImages: () => void;
  onClose: () => void;
}

export default function QuickImageSettings({
  item, placement, previewUrl, modeConfig, unit, canRotateCopy,
  onChange, onOpenEditor, onRotateCopy, onDuplicate, onDownload, onOpenImages, onClose,
}: QuickImageSettingsProps) {
  const [expanded, setExpanded] = useState(true);
  const tools: { label: string; icon: StudioIconName; editor: EditorView }[] = [
    { label: "Edit photo", icon: "edit", editor: "adjust" },
    { label: "Crop", icon: "crop", editor: "crop" },
    { label: "Frames & text", icon: "layers", editor: "layers" },
    { label: "Background", icon: "background", editor: "background" },
    { label: "ID Photo", icon: "portrait", editor: "id" },
  ];
  return (
    <section
      className={"preview-image-settings" + (expanded ? "" : " is-collapsed")}
      aria-labelledby="preview-image-settings-title"
      aria-label="Selected image settings"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="preview-image-settings-header">
        <div className="preview-image-settings-heading">
          <strong id="preview-image-settings-title">Image settings</strong>
          <small>Copy {placement.copyIndex + 1} · Edit selected design</small>
        </div>
        <div className="preview-image-settings-header-actions">
          <button type="button" className="icon-button" onClick={() => setExpanded(value => !value)}
            aria-expanded={expanded} aria-label={expanded ? "Collapse image settings" : "Expand image settings"}>
            <StudioIcon name={expanded ? "down" : "up"} size={17} />
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close image settings">
            <StudioIcon name="close" size={18} />
          </button>
        </div>
      </header>
      {expanded && (
        <div className="preview-image-settings-body">
          <div className="preview-image-settings-identity">
            {previewUrl ? (
              <img src={previewUrl} alt="" draggable={false} />
            ) : (
              <span className="preview-image-settings-placeholder"><StudioIcon name="images" size={22} /></span>
            )}
            <div>
              <strong title={item.name}>{item.name}</strong>
              <small>{placement.widthMm.toFixed(1)} × {placement.heightMm.toFixed(1)} mm on sheet</small>
            </div>
          </div>
          <div className="preview-image-settings-actions">
            {tools.map(tool => (
              <button type="button" key={tool.editor} className="secondary-button"
                onClick={() => onOpenEditor(tool.editor, item.id)}>
                <StudioIcon name={tool.icon} size={18} />
                <span>{tool.label}</span>
              </button>
            ))}
            <button type="button" className="secondary-button" onClick={onDuplicate}>
              <StudioIcon name="duplicate" size={18} /><span>Duplicate design</span>
            </button>
          </div>
          {!modeConfig ? (
            <div className="preview-image-settings-dimensions">
              <DimensionField label="Width" unit={unit} valueMm={item.widthMm}
                onCommit={widthMm => onChange({ ...item, widthMm })} />
              <DimensionField label="Height" unit={unit} valueMm={item.heightMm}
                onCommit={heightMm => onChange({ ...item, heightMm })} />
              <SafeIntegerField label="Copies" value={item.quantity} min={1} max={1000}
                onCommit={quantity => onChange({ ...item, quantity })} />
            </div>
          ) : (
            <p className="preview-image-settings-hint">
              Print Mode controls the physical size and number of copies. Source image edits apply to every printed copy.
            </p>
          )}
          <div className="preview-image-settings-footer">
            {canRotateCopy && (
              <button type="button" className="secondary-button" onClick={onRotateCopy}
                title="Rotate only this printed copy by 90 degrees">
                <StudioIcon name="reset" size={16} /> Rotate copy
              </button>
            )}
            <button type="button" className="secondary-button" onClick={onDownload}>
              <StudioIcon name="download" size={16} /> PNG
            </button>
            <button type="button" className="secondary-button" onClick={onOpenImages}>
              <StudioIcon name="images" size={16} /> Images tab
            </button>
          </div>
          <p className="preview-image-settings-hint">
            Photo, crop, and frame edits affect this design across all copies. Position and copy rotation are per-placement.
          </p>
        </div>
      )}
    </section>
  );
}
