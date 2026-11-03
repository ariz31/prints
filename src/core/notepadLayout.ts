import type {Orientation,PrintItemSpec,SheetPage} from "./layout.ts";
import type {TrimLine} from "./cutMarks.ts";

/** Fixed straight-cut grids; each internal boundary is cut once. */
export const NOTEPAD_PRESETS = [
  {id:"2",label:"2-up",columns:1,rows:2},
  {id:"3",label:"3-up",columns:1,rows:3},
  {id:"4",label:"4-up",columns:2,rows:2},
  {id:"6",label:"6-up",columns:2,rows:3},
  {id:"8",label:"8-up",columns:2,rows:4},
  {id:"9",label:"9-up",columns:3,rows:3},
  {id:"10",label:"10-up",columns:2,rows:5},
  {id:"12",label:"12-up",columns:3,rows:4},
] as const;
export type NotepadPresetId = (typeof NOTEPAD_PRESETS)[number]["id"];
/** Subtle non-artwork trimming guides. Keep the PDF vector line faint while
 * making the screen preview readable at reduced zoom. */
export const NOTEPAD_CUT_GUIDE_STYLE = {
  color: "#D0D0D0",
  pdfStrokePt: 0.15,
  previewStrokeMm: 0.12,
} as const;
export function validNotepadPreset(value:unknown):value is NotepadPresetId {
  return typeof value==="string" && NOTEPAD_PRESETS.some(p=>p.id===value);
}
export interface CutGrid {
  columns:number;rows:number;copiesPerSheet:number;cutLines:number;
  cellWidthMm:number;cellHeightMm:number;artWidthMm:number;artHeightMm:number;
}
const EPS=1e-6;
/** The paper's cut cells include white safety insets. The artwork is inset
 * within each exact physical cut cell so normal non-borderless printers can print it. */
export function notepadGrid(
 preset:NotepadPresetId,paper:{widthMm:number;heightMm:number},
 orientation:Orientation,insetMm:number,
):CutGrid {
  if(!validNotepadPreset(preset))throw new Error("Select a valid notepad grid.");
  if(!Number.isFinite(insetMm)||insetMm<0)throw new Error("Notepad artwork inset must be nonnegative.");
  if(!Number.isFinite(paper.widthMm)||!Number.isFinite(paper.heightMm)||
    paper.widthMm<=EPS||paper.heightMm<=EPS||paper.widthMm>2000||paper.heightMm>2000)
    throw new Error("Notepad sheet dimensions are invalid.");
  const chosen=NOTEPAD_PRESETS.find(p=>p.id===preset)!;
  const columns=orientation==="portrait"?chosen.columns:chosen.rows;
  const rows=orientation==="portrait"?chosen.rows:chosen.columns;
  const cellWidthMm=paper.widthMm/columns,cellHeightMm=paper.heightMm/rows;
  const artWidthMm=cellWidthMm-2*insetMm,artHeightMm=cellHeightMm-2*insetMm;
  if(artWidthMm<=EPS||artHeightMm<=EPS)
    throw new Error("Notepad inset leaves no printable artwork. Reduce the margin.");
  return {columns,rows,copiesPerSheet:columns*rows,cutLines:columns+rows-2,
    cellWidthMm,cellHeightMm,artWidthMm,artHeightMm};
}
export function composeNotepadSheets(
 items:ReadonlyArray<PrintItemSpec>,preset:NotepadPresetId,
 paper:{widthMm:number;heightMm:number},orientation:Orientation,insetMm:number,
):SheetPage[] {
  const grid=notepadGrid(preset,paper,orientation,insetMm);
  if(items.length===0)return [];
  if(items.length!==1)
    throw new Error("A notepad grid repeats one design. Use a separate print job for each design.");
  const item=items[0];
  if(!item.id||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000)
    throw new Error("Notepad quantity must be an integer from 1 to 1,000.");
  if(Math.abs(item.widthMm-grid.artWidthMm)>0.001||
     Math.abs(item.heightMm-grid.artHeightMm)>0.001)
    throw new Error("The notepad artwork size changed. Reapply the selected notepad preset.");
  const count=Math.ceil(item.quantity/grid.copiesPerSheet);
  if(count>200)throw new Error("This job exceeds 200 notepad sheets.");
  return Array.from({length:count},(_,pageIndex)=>({
    placements:Array.from({length:Math.min(grid.copiesPerSheet,item.quantity-pageIndex*grid.copiesPerSheet)},(_,index)=>{
      const col=index%grid.columns,row=Math.floor(index/grid.columns);
      return {itemId:item.id,copyIndex:pageIndex*grid.copiesPerSheet+index,
        xMm:col*grid.cellWidthMm+insetMm,yMm:row*grid.cellHeightMm+insetMm,
        widthMm:grid.artWidthMm,heightMm:grid.artHeightMm};
    }),
  }));
}
/** Guides stop at the printer-safe inset; their positions remain the exact
 * physical full-sheet cut coordinates. No extra outer trimming is required. */
export function notepadCutLines(
 preset:NotepadPresetId,paper:{widthMm:number;heightMm:number},
 orientation:Orientation,insetMm:number,
):TrimLine[] {
  const g=notepadGrid(preset,paper,orientation,insetMm);
  const lines:TrimLine[]=[];
  for(let col=1;col<g.columns;col++){
    const x=col*g.cellWidthMm;
    lines.push({x1:x,y1:insetMm,x2:x,y2:paper.heightMm-insetMm});
  }
  for(let row=1;row<g.rows;row++){
    const y=row*g.cellHeightMm;
    lines.push({x1:insetMm,y1:y,x2:paper.widthMm-insetMm,y2:y});
  }
  return lines;
}
/** Deterministic no-overflow autofill for a single repeated design. A fixed
 * grid is intentionally predictable for guillotine cutting and not a claim
 * that mixed-orientation bin packing is globally optimal. */
export function optimalSingleDesignCopies(
 item:Pick<PrintItemSpec,"widthMm"|"heightMm"|"canRotate">,
 paper:{widthMm:number;heightMm:number},marginMm:number,gapMm:number,
 autoRotate:boolean,
):number {
  const W=paper.widthMm-2*marginMm,H=paper.heightMm-2*marginMm;
  if(![W,H,gapMm,item.widthMm,item.heightMm].every(Number.isFinite)||
    W<=0||H<=0||gapMm<0||item.widthMm<=0||item.heightMm<=0)
    throw new Error("Invalid dimensions for automatic copy calculation.");
  const fit=(w:number,h:number)=>Math.max(0,Math.floor((W+gapMm+EPS)/(w+gapMm)))*
    Math.max(0,Math.floor((H+gapMm+EPS)/(h+gapMm)));
  const count=Math.max(fit(item.widthMm,item.heightMm),
    autoRotate&&item.canRotate===true?fit(item.heightMm,item.widthMm):0);
  if(count<1)throw new Error("This design does not fit the printable sheet.");
  return Math.min(1000,count);
}
