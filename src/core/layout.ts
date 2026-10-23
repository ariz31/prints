export const MM_PER_INCH = 25.4;
export const PDF_POINTS_PER_MM = 72 / MM_PER_INCH;

export type PaperName = "A4" | "A3" | "Letter" | "Legal" | "Long Bond" | "Custom";
export type Orientation = "portrait" | "landscape";

export const PAPER_SIZES: Record<Exclude<PaperName, "Custom">, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
  "Long Bond": { widthMm: 215.9, heightMm: 330.2 },
};

export interface PrintItemSpec {
  id: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
}

export interface LayoutOptions {
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
  gapMm: number;
  packing?: "ordered" | "compact";
}

export interface Placement {
  itemId: string;
  copyIndex: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotated?: boolean;
}

export interface SheetPage {
  placements: Placement[];
}

const EPSILON = 1e-8;
const MAX_COPIES = 1000;
const MAX_SHEETS = 200;

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function getPaperDimensions(
  paper: PaperName,
  orientation: Orientation,
  custom: { widthMm: number; heightMm: number } = { widthMm: 210, heightMm: 297 },
): { widthMm: number; heightMm: number } {
  const dims = paper === "Custom" ? custom : PAPER_SIZES[paper];
  return orientation === "portrait" ? { ...dims } : { widthMm: dims.heightMm, heightMm: dims.widthMm };
}

/** Physical print packing with optional compact height-sorted shelf layout. */
export function composeSheets(items: ReadonlyArray<PrintItemSpec>, settings: LayoutOptions): SheetPage[] {
  const { paperWidthMm, paperHeightMm, marginMm, gapMm } = settings;
  if (!validPositive(paperWidthMm) || !validPositive(paperHeightMm)) {
    throw new Error("Paper width and height must be positive.");
  }
  if (!Number.isFinite(marginMm) || marginMm < 0 || !Number.isFinite(gapMm) || gapMm < 0) {
    throw new Error("Margins and spacing must be nonnegative.");
  }
  const availableWidth = paperWidthMm - 2 * marginMm;
  const availableHeight = paperHeightMm - 2 * marginMm;
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error("Margins leave no printable area.");
  }
  let total = 0;
  for (const item of items) {
    if (!validPositive(item.widthMm) || !validPositive(item.heightMm)) {
      throw new Error("Every print item must have positive dimensions.");
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Each print quantity must be a positive integer.");
    }
    total += item.quantity;
    if (total > MAX_COPIES) {
      throw new Error("The first-release composer supports at most 1,000 copies per job.");
    }
    if (item.widthMm > availableWidth + EPSILON || item.heightMm > availableHeight + EPSILON) {
      throw new Error("An item is larger than the available printable area.");
    }
  }
  if (total === 0) return [];

  const ordered=packShelves(items,settings);
  if(settings.packing!=="compact"||items.length<2)return ordered;
  const sorted=[...items].sort((a,b)=>b.heightMm-a.heightMm||b.widthMm-a.widthMm||
    a.id.localeCompare(b.id));
  const compact=packShelves(sorted,settings);
  return compact.length <= ordered.length ? compact : ordered;
}

/**
 * Deterministic shelf packing. A compact run may reorder product groups to
 * reduce page count; the original order remains available as a selectable mode.
 */
function packShelves(items:ReadonlyArray<PrintItemSpec>,settings:LayoutOptions):SheetPage[]{
  const {paperWidthMm,paperHeightMm,marginMm,gapMm}=settings;
  const pages: SheetPage[] = [];
  let current: Placement[] = [];
  let x = marginMm;
  let y = marginMm;
  let rowHeight = 0;

  for (const item of items) {
    for (let index = 0; index < item.quantity; index++) {
      if (x + item.widthMm > paperWidthMm - marginMm + EPSILON) {
        x = marginMm;
        y += rowHeight + gapMm;
        rowHeight = 0;
      }
      if (y + item.heightMm > paperHeightMm - marginMm + EPSILON) {
        if (current.length > 0) pages.push({ placements: current });
        if(pages.length >= MAX_SHEETS) {
          throw new Error("This job exceeds 200 print sheets. Split it into smaller batches.");
        }
        current = [];
        x = marginMm;
        y = marginMm;
        rowHeight = 0;
      }
      current.push({
        itemId: item.id,
        copyIndex: index,
        xMm: x,
        yMm: y,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
      });
      x += item.widthMm + gapMm;
      rowHeight = Math.max(rowHeight, item.heightMm);
    }
  }
  if (current.length > 0) pages.push({ placements: current });
  return pages;
}

export function pageUtilization(page: SheetPage, settings: LayoutOptions): number {
  const area = settings.paperWidthMm * settings.paperHeightMm;
  if (!validPositive(area)) return 0;
  return page.placements.reduce((sum, p) => sum + p.widthMm * p.heightMm, 0) / area;
}
