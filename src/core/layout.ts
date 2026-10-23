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
  /** True only if its visual/text content can be rotated without changing semantics. */
  canRotate?: boolean;
}

export interface LayoutOptions {
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
  gapMm: number;
  packing?: "ordered" | "compact" | "optimized";
  /** Rotations are opt-in and allowed only for designs explicitly marked safe. */
  autoRotate?: boolean;
}

export interface Placement {
  itemId: string;
  copyIndex: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** The printed design is rotated counter-clockwise by 90 degrees. */
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
    const fits=(item.widthMm <= availableWidth + EPSILON && item.heightMm <= availableHeight + EPSILON) ||
      (settings.packing==="optimized" && settings.autoRotate && item.canRotate===true &&
        item.heightMm <= availableWidth + EPSILON && item.widthMm <= availableHeight + EPSILON);
    if (!fits) {
      throw new Error("An item is larger than the available printable area.");
    }
  }
  if (total === 0) return [];

  // Oversized portrait-only items which fit solely when rotated cannot be
  // processed by the unrotated shelf fallback. Attempt the optimized path first.
  const rotationOnly=items.some(item=>
    (item.widthMm>availableWidth+EPSILON||item.heightMm>availableHeight+EPSILON));
  if(rotationOnly){
    const pages=packMaxRects(items,settings);
    if(pages)return pages;
    throw new Error("Cannot arrange this print size on the selected paper.");
  }
  const ordered=packShelves(items,settings);
  if(settings.packing==="optimized"){
    const compact=packShelves([...items].sort((a,b)=>b.heightMm-a.heightMm||b.widthMm-a.widthMm||a.id.localeCompare(b.id)),settings);
    const fallback=compact.length<ordered.length?compact:ordered;
    // Bound worst-case algorithm cost on large local/mobile jobs.
    if(total>300)return fallback;
    const optimized=packMaxRects(items,settings);
    return optimized&&optimized.length<=fallback.length?optimized:fallback;
  }
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

interface FreeRect {x:number;y:number;w:number;h:number}
interface MaxRectsPage {placements:Placement[];free:FreeRect[]}
const overlap=(a:FreeRect,b:FreeRect)=>a.x<b.x+b.w-EPSILON&&b.x<a.x+a.w-EPSILON&&
 a.y<b.y+b.h-EPSILON&&b.y<a.y+a.h-EPSILON;
const contains=(a:FreeRect,b:FreeRect)=>b.x>=a.x-EPSILON&&b.y>=a.y-EPSILON&&
 b.x+b.w<=a.x+a.w+EPSILON&&b.y+b.h<=a.y+a.h+EPSILON;
/** Deterministic bounded MaxRects with right/bottom gap reservations. */
function packMaxRects(items:ReadonlyArray<PrintItemSpec>,settings:LayoutOptions):SheetPage[]|null {
 const {paperWidthMm, paperHeightMm, marginMm, gapMm}=settings;
 const W=paperWidthMm-2*marginMm,H=paperHeightMm-2*marginMm;
 const copies=items.flatMap(item=>Array.from({length:item.quantity},(_,copyIndex)=>({item,copyIndex})))
  .sort((a,b)=>b.item.widthMm*b.item.heightMm-a.item.widthMm*a.item.heightMm||
   Math.max(b.item.widthMm,b.item.heightMm)-Math.max(a.item.widthMm,a.item.heightMm)||
   a.item.id.localeCompare(b.item.id)||a.copyIndex-b.copyIndex);
 const pages:MaxRectsPage[]=[];
 const fresh=():MaxRectsPage=>({placements:[],free:[{x:marginMm,y:marginMm,w:W,h:H}]});
 for(const {item,copyIndex} of copies){
  let best:{page:number;rect:FreeRect;w:number;h:number;rotated:boolean;score:number;tie:number}|null=null;
  // Search all pages and orientation candidates. Earlier pages win exact ties.
  for(let pi=0;pi<=pages.length;pi++){
   if(pi===pages.length&&pages.length>=MAX_SHEETS)return null;
   const current=pages[pi]??fresh();
   for(const rect of current.free){
    for(const rotated of (settings.autoRotate&&item.canRotate===true?[false,true]:[false])){
     const w=rotated?item.heightMm:item.widthMm,h=rotated?item.widthMm:item.heightMm;
     if(w>rect.w+EPSILON||h>rect.h+EPSILON)continue;
     const short=Math.min(rect.w-w,rect.h-h);
     const long=Math.max(rect.w-w,rect.h-h);
     const score=short*100000+long;
     const tie=rect.y*paperWidthMm+rect.x;
     if(!best||pi<best.page||(pi===best.page&&
       (score<best.score-EPSILON||(Math.abs(score-best.score)<=EPSILON&&tie<best.tie)))){
       best={page:pi,rect,w,h,rotated,score,tie};
     }
    }
   }
  }
  if(!best)return null;
  const {page:pi,rect,w,h,rotated}=best;
  if(pi===pages.length)pages.push(fresh());
  const pg=pages[pi];
  const p:Placement={itemId:item.id,copyIndex,xMm:rect.x,yMm:rect.y,
    widthMm:w,heightMm:h,...(rotated?{rotated:true}:{})};
  pg.placements.push(p);
  const used:FreeRect={x:rect.x,y:rect.y,w:w+gapMm,h:h+gapMm};
  const updated:FreeRect[]=[];
  for(const r of pg.free){
   if(!overlap(r,used)){updated.push(r);continue;}
   const right=r.x+r.w,bottom=r.y+r.h;
   if(used.x>r.x+EPSILON)updated.push({x:r.x,y:r.y,w:used.x-r.x,h:r.h});
   if(used.x+used.w<right-EPSILON)updated.push({x:used.x+used.w,y:r.y,w:right-used.x-used.w,h:r.h});
   if(used.y>r.y+EPSILON)updated.push({x:r.x,y:r.y,w:r.w,h:used.y-r.y});
   if(used.y+used.h<bottom-EPSILON)updated.push({x:r.x,y:used.y+used.h,w:r.w,h:bottom-used.y-used.h});
  }
  pg.free=updated.filter((r,i)=>r.w>EPSILON&&r.h>EPSILON&&
    !updated.some((other,j)=>i!==j&&contains(other,r)&&
      (other.w*other.h>r.w*r.h+EPSILON||(Math.abs(other.w*other.h-r.w*r.h)<EPSILON&&j<i))));
 }
 return pages.map(pg=>({placements:pg.placements}));
}

export function pageUtilization(page: SheetPage, settings: LayoutOptions): number {
  const area = settings.paperWidthMm * settings.paperHeightMm;
  if (!validPositive(area)) return 0;
  return page.placements.reduce((sum, p) => sum + p.widthMm * p.heightMm, 0) / area;
}
