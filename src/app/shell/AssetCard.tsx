import { memo } from "react";
import type { PhotoAsset } from "../../domain/models/asset.ts";
import type { Orientation } from "../../domain/models/sheet.ts";
import type { UserPreferences } from "../../domain/models/preferences.ts";
import type { NotepadPresetId } from "../../features/sheet-composer/logic/notepadLayout.ts";
import { NOTEPAD_PRESETS, validNotepadPreset } from "../../features/sheet-composer/logic/notepadLayout.ts";
import { exactCropSourceRect } from "../../features/crop/logic/crop.ts";
import { MM_PER_INCH } from "../../domain/geometry/units.ts";
import { lookupPrintSize, matchingPrintSizePreset, PRINT_SIZE_PRESETS } from "../../domain/geometry/dimensions.ts";
import StudioSelect from "../../components/StudioSelect.tsx";
import StudioIcon from "../../components/StudioIcon.tsx";
import DimensionField from "../../components/DimensionField.tsx";
import SafeIntegerField from "../../components/SafeIntegerField.tsx";
import AssetThumbnail from "./AssetThumbnail.tsx";

export interface AssetCardProps {
  item: PhotoAsset;
  expanded: boolean;
  onToggleExpanded: () => void;
  modeQuantityOverride?: boolean;
  modeSizingOverride?: boolean;
  previewUrl?: string;
  unit: UserPreferences["unit"];
  orientation: Orientation;
  paper: { widthMm: number; heightMm: number };
  notepadPreset: NotepadPresetId | undefined;
  canUseNotepad: boolean;
  onNotepadChange: (preset: NotepadPresetId | undefined) => void;
  onChange: (value: PhotoAsset) => void;
  onRemove: () => void;
  onAdjust: () => void;
  onId: () => void;
  onCrop: () => void;
  onBackground: () => void;
  onLayers: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
}

export function areAssetCardPropsEqual(prev: AssetCardProps, next: AssetCardProps): boolean {
  if (prev.item.id !== next.item.id) return false;
  if (prev.expanded !== next.expanded) return false;
  if (prev.item.quantity !== next.item.quantity) return false;
  if (prev.item.widthMm !== next.item.widthMm || prev.item.heightMm !== next.item.heightMm) return false;
  if (prev.previewUrl !== next.previewUrl) return false;
  if (prev.item.url !== next.item.url || prev.item.processedUrl !== next.item.processedUrl) return false;
  if (prev.unit !== next.unit) return false;
  if (prev.orientation !== next.orientation) return false;
  if (prev.paper.widthMm !== next.paper.widthMm || prev.paper.heightMm !== next.paper.heightMm) return false;
  if (prev.notepadPreset !== next.notepadPreset) return false;
  if (prev.canUseNotepad !== next.canUseNotepad) return false;
  if (prev.modeQuantityOverride !== next.modeQuantityOverride) return false;
  if (prev.modeSizingOverride !== next.modeSizingOverride) return false;

  // Crop geometry
  if (
    prev.item.crop.x !== next.item.crop.x ||
    prev.item.crop.y !== next.item.crop.y ||
    prev.item.crop.width !== next.item.crop.width ||
    prev.item.crop.height !== next.item.crop.height ||
    prev.item.cropShape !== next.item.cropShape
  ) {
    return false;
  }

  // Layers count
  if ((prev.item.layers?.length ?? 0) !== (next.item.layers?.length ?? 0)) return false;

  // Adjustments object reference or content
  if (prev.item.adjustments !== next.item.adjustments) {
    if (JSON.stringify(prev.item.adjustments) !== JSON.stringify(next.item.adjustments)) return false;
  }

  return true;
}

function AssetCardComponent({
  item,
  expanded,
  onToggleExpanded,
  previewUrl,
  unit,
  orientation,
  paper,
  notepadPreset,
  canUseNotepad,
  onNotepadChange,
  onChange,
  onRemove,
  onAdjust,
  onId,
  onCrop,
  onBackground,
  onLayers,
  onDownload,
  onDuplicate,
  modeQuantityOverride = false,
  modeSizingOverride = false,
}: AssetCardProps) {
  let dpi = Number.NaN;
  try {
    const c = exactCropSourceRect(
      item.processedWidth ?? item.pixelWidth,
      item.processedHeight ?? item.pixelHeight,
      item.crop,
      item.widthMm,
      item.heightMm
    );
    dpi = Math.floor(Math.min(c.sw / (item.widthMm / MM_PER_INCH), c.sh / (item.heightMm / MM_PER_INCH)));
  } catch {
    /* Dimensions reported separately */
  }

  const sizePreset = matchingPrintSizePreset(item.widthMm, item.heightMm);
  const activeSize = notepadPreset ? "sheet-cut-" + notepadPreset : sizePreset ?? "";

  return (
    <article className={"asset-card" + (expanded ? "" : " is-collapsed")}>
      <div className="asset-heading">
        <AssetThumbnail item={item} previewUrl={previewUrl} />
        <div className="asset-name">
          <strong title={item.name}>{item.name}</strong>
          <small>
            {item.pixelWidth} × {item.pixelHeight} px
          </small>
        </div>
        <button
          type="button"
          className="icon-button asset-expand-toggle"
          aria-label={(expanded ? "Collapse " : "Expand ") + item.name + " settings"}
          aria-expanded={expanded}
          aria-controls={"asset-details-" + item.id}
          title={(expanded ? "Collapse " : "Expand ") + item.name}
          onClick={onToggleExpanded}
        >
          <StudioIcon name="chevron" size={19} />
        </button>
        <button
          className="icon-button"
          title={"Remove " + item.name}
          aria-label={"Remove " + item.name}
          onClick={onRemove}
        >
          <StudioIcon name="close" size={17} />
        </button>
      </div>

      <div id={"asset-details-" + item.id} className="asset-card-details" hidden={!expanded}>
        {expanded && (<>
      <div className="two-inputs">
        <button className="primary-button" onClick={onAdjust}>
          <StudioIcon name="edit" size={16} />
          Edit photo
        </button>
        <button className="secondary-button" onClick={onId}>
          ID Photo Studio
        </button>
        <button className="secondary-button" onClick={onCrop}>
          <StudioIcon name="crop" size={16} />
          Crop
        </button>
        <button className="secondary-button" onClick={onBackground}>
          <StudioIcon name="background" size={16} />
          Background
        </button>
        <button className="secondary-button" onClick={onLayers}>
          <StudioIcon name="layers" size={16} />
          Frames &amp; text ({item.layers?.length ?? 0})
        </button>
      </div>

      {!modeSizingOverride && (
        <label title="Select an individual print size or an equal-cut layout on the current sheet.">
          Size preset
          <StudioSelect
            value={activeSize}
            onChange={event => {
              const selected = event.target.value;
              if (selected.startsWith("sheet-cut-")) {
                const preset = selected.slice("sheet-cut-".length);
                if (validNotepadPreset(preset)) onNotepadChange(preset);
                return;
              }
              if (!selected) {
                if (notepadPreset) onNotepadChange(undefined);
                return;
              }
              const size = lookupPrintSize(selected);
              onChange({ ...item, ...size });
            }}
          >
            <option value="">Custom size / turn off sheet cutting</option>
            <optgroup label="Individual photo and product sizes">
              {PRINT_SIZE_PRESETS.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Equal-cut sheet presets">
              {NOTEPAD_PRESETS.map(preset => {
                const columns = orientation === "portrait" ? preset.columns : preset.rows;
                const rows = orientation === "portrait" ? preset.rows : preset.columns;
                return (
                  <option key={"sheet-cut-" + preset.id} value={"sheet-cut-" + preset.id} disabled={!canUseNotepad}>
                    {preset.label} · {columns} × {rows} · {(paper.widthMm / columns).toFixed(2)} ×{" "}
                    {(paper.heightMm / rows).toFixed(2)} mm per cut
                  </option>
                );
              })}
            </optgroup>
          </StudioSelect>
        </label>
      )}

      {!modeSizingOverride &&
        (notepadPreset ? (
          <p className="hint">
            Equal-cut sheet layout active. Artwork is inset within each cut. Adjust margins and cutting guides under
            Print; export at 100% / Actual Size.
          </p>
        ) : (
          <p className="hint">
            Equal-cut presets repeat this design across the selected paper.
            {canUseNotepad ? "" : " Sheet cutting requires only one image design per job."}
          </p>
        ))}

      {!modeSizingOverride && (
        <div className="three-inputs">
          <DimensionField
            label="Width"
            unit={unit}
            valueMm={item.widthMm}
            onCommit={v => onChange({ ...item, widthMm: v })}
          />
          <DimensionField
            label="Height"
            unit={unit}
            valueMm={item.heightMm}
            onCommit={v => onChange({ ...item, heightMm: v })}
          />
          {!modeQuantityOverride && (
            <SafeIntegerField
              label="Copies"
              value={item.quantity}
              min={1}
              max={1000}
              onCommit={v => onChange({ ...item, quantity: v })}
            />
          )}
        </div>
      )}

      {modeQuantityOverride && (
        <p className="hint">
          Printed quantities{modeSizingOverride ? " and sizes" : ""} are controlled by the active Print Mode. Your
          original design remains editable.
        </p>
      )}

      <div className="two-inputs">
        <button
          className="secondary-button"
          onClick={onDuplicate}
          title="Create another independently cropped design from this same original image"
        >
          <StudioIcon name="duplicate" size={16} />
          Duplicate design
        </button>
        <button
          className="secondary-button"
          title="Download the cropped image with text, shapes and photo adjustments"
          onClick={onDownload}
        >
          <StudioIcon name="download" size={16} />
          Download PNG
        </button>
      </div>

      {Number.isFinite(dpi) && dpi < 150 && (
        <p className="warning">Low resolution: approximately {dpi} DPI at requested size.</p>
      )}
        </>)}
      </div>
    </article>
  );
}

export const AssetCard = memo(AssetCardComponent, areAssetCardPropsEqual);
export default AssetCard;
