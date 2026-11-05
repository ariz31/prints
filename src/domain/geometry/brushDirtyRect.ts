/** Bounds of all pixels touched by a brush segment. Canvas putImageData can
 * upload only this rectangle instead of the full multi-megapixel mask. */
export function brushDirtyRect(
 from:{x:number;y:number},to:{x:number;y:number},radius:number,width:number,height:number,
){
 const pad=Math.ceil(radius)+2;
 const left=Math.max(0,Math.floor(Math.min(from.x,to.x)-pad));
 const top=Math.max(0,Math.floor(Math.min(from.y,to.y)-pad));
 const right=Math.min(width,Math.ceil(Math.max(from.x,to.x)+pad+1));
 const bottom=Math.min(height,Math.ceil(Math.max(from.y,to.y)+pad+1));
 return {x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
}
