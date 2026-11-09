/** Detect both hard and soft alpha silhouettes for an edge-only preview.
 * A binary 0/255 cutout must still show its outline. */
export function isMaskEdge(mask:Uint8Array,width:number,height:number,x:number,y:number):boolean{
  if(width<1||height<1||mask.length!==width*height||
    x<0||y<0||x>=width||y>=height)return false;
  const current=mask[y*width+x];
  if(current>12&&current<243)return true;
  const delta=24;
  if(x>0&&Math.abs(mask[y*width+x-1]-current)>delta)return true;
  if(x<width-1&&Math.abs(mask[y*width+x+1]-current)>delta)return true;
  if(y>0&&Math.abs(mask[(y-1)*width+x]-current)>delta)return true;
  if(y<height-1&&Math.abs(mask[(y+1)*width+x]-current)>delta)return true;
  return false;
}
