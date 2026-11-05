/** Keeps the menu within the visual viewport, including Android keyboard resizing. */
export interface PaperPickerAnchor {top:number;left:number;bottom:number;width:number}
export interface PaperPickerViewport {width:number;height:number;offsetTop?:number;offsetLeft?:number}
export interface PaperPickerBounds {top:number;left:number;width:number;maxHeight:number}
export function paperPickerBounds(anchor:PaperPickerAnchor,viewport:PaperPickerViewport,preferredMaxHeight=340):PaperPickerBounds{
 const leftEdge=viewport.offsetLeft??0,topEdge=viewport.offsetTop??0;
 const vw=Math.max(1,viewport.width),vh=Math.max(1,viewport.height);
 const width=Math.min(Math.max(anchor.width,260),380,Math.max(1,vw-24));
 const left=Math.max(leftEdge+12,Math.min(anchor.left,leftEdge+vw-width-12));
 const below=Math.max(0,topEdge+vh-anchor.bottom-8);
 const above=Math.max(0,anchor.top-topEdge-8);
 const useAbove=below<220&&above>below;
 const space=useAbove?above:below;
 const maxHeight=Math.min(Math.max(80,preferredMaxHeight),Math.max(80,Math.min(space,vh-16)));
 const ideal=useAbove?anchor.top-maxHeight-5:anchor.bottom+5;
 const top=Math.max(topEdge+8,Math.min(ideal,topEdge+vh-maxHeight-8));
 return {left,top,width,maxHeight};
}
