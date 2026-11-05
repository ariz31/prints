import type { PhotoAsset } from "../../../domain/models/asset.ts";
import type { Placement, SheetPage } from "../../../domain/models/sheet.ts";

/** UI-only selection: never persisted or included in print geometry/export. */
export interface PreviewImageSelection {
  pageIndex: number;
  itemId: string;
  copyIndex: number;
}

/**
 * Resolve a tapped placement back to its source asset. Mode-specific layout
 * copies may have different physical dimensions, but edits belong to the
 * original image design rather than a temporary mode-sized layout copy.
 */
export function resolvePreviewImageSelection(
  selection: PreviewImageSelection | null,
  pageIndex: number,
  page: SheetPage | undefined,
  sourceAssets: readonly PhotoAsset[],
): { placement: Placement; asset: PhotoAsset } | null {
  if (!selection || !page || selection.pageIndex !== pageIndex) return null;
  const placement = page.placements.find(
    candidate => candidate.itemId === selection.itemId && candidate.copyIndex === selection.copyIndex,
  );
  if (!placement) return null;
  const asset = sourceAssets.find(candidate => candidate.id === placement.itemId);
  return asset ? { placement, asset } : null;
}
