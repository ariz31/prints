import type { Placement } from "./layout.ts";
export type TrimStyle = "outline" | "corner";
export interface TrimLine {x1:number;y1:number;x2:number;y2:number}
export const CORNER_MARK_LENGTH_MM=1;
export const CORNER_MARK_OFFSET_MM=.4;
export const MIN_CORNER_MARGIN_MM=1.5;
export const MIN_CORNER_GAP_MM=3;
/** Cut marks lie outside the actual trimmed product, in paper whitespace. */
export function cornerCutLines(placement: Pick<Placement,"xMm"|"yMm"|"widthMm"|"heightMm">):TrimLine[]{
 const {xMm:x,yMm:y,widthMm:w,heightMm:h}=placement;
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)
   throw new Error("Invalid print placement for cut marks.");
 const o=CORNER_MARK_OFFSET_MM, l=CORNER_MARK_LENGTH_MM;
 const lines:TrimLine[]=[];
 for(const [cx,cy,sx,sy] of [
   [x,y,-1,-1],[x+w,y,1,-1],[x,y+h,-1,1],[x+w,y+h,1,1]
 ]){
   lines.push({x1:cx+sx*o,y1:cy,x2:cx+sx*(o+l),y2:cy});
   lines.push({x1:cx,y1:cy+sy*o,x2:cx,y2:cy+sy*(o+l)});
 }
 return lines;
}
export function validateCornerMarkClearance(marginMm:number,gapMm:number):void{
 if(![marginMm,gapMm].every(Number.isFinite) ||
   marginMm<MIN_CORNER_MARGIN_MM || gapMm<MIN_CORNER_GAP_MM){
   throw new Error("Corner cut marks need at least 1.5 mm margins and 3 mm between items.");
 }
}
