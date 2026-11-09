import type {MaskPoint} from "./backgroundRecipe.ts";

/** Snap to a strong foreground silhouette OR actual photo color boundary.
 * Original photo RGB is used even if the current alpha mask is fully opaque.
 * A small spatial penalty avoids snapping to a distant, unrelated edge. */
export function snapBrushToEdge(
  point:MaskPoint, mask:Uint8Array, rgba:Uint8ClampedArray,
  width:number,height:number,enabled:boolean,
):MaskPoint{
  if(!enabled)return point;
  if(width<3||height<3||mask.length!==width*height||rgba.length!==width*height*4)
    return point;
  const x=Math.round(point.x*(width-1)),y=Math.round(point.y*(height-1));
  const contrast=(a:number,b:number)=>{
    const l=a*4,r=b*4;
    return Math.abs(rgba[l]-rgba[r])+
      Math.abs(rgba[l+1]-rgba[r+1])+
      Math.abs(rgba[l+2]-rgba[r+2]);
  };
  let best=0,bestPoint=point;
  for(let dy=-6;dy<=6;dy+=2)for(let dx=-6;dx<=6;dx+=2){
    const px=x+dx,py=y+dy;
    if(px<1||py<1||px>=width-1||py>=height-1)continue;
    const center=py*width+px;
    const alphaEdge=Math.abs(mask[center-1]-mask[center+1])+
      Math.abs(mask[center-width]-mask[center+width]);
    const rgbEdge=contrast(center-1,center+1)+
      contrast(center-width,center+width);
    const edge=alphaEdge*1.3+rgbEdge*.65;
    if(edge<85)continue;
    const score=edge-Math.hypot(dx,dy)*8;
    if(score>best){best=score;bestPoint={x:px/(width-1),y:py/(height-1)};}
  }
  return bestPoint;
}
