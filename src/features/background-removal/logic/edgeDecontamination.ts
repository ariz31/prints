/** Recolor partly-transparent edge pixels from nearby confident foreground.
 * Uses immutable original RGB to avoid directional color smears. The image
 * buffer may contain only a stripe, but includes a 3-row halo when streaming.
 * All coordinates on the mask are in full-image space. */
export function cleanEdgeColors(
  output:Uint8ClampedArray,source:Uint8ClampedArray,
  mask:Uint8Array,width:number,height:number,sourceStartY:number,
  firstY:number,rows:number,strength:number,
):void{
  if(strength<=0)return;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    mask.length!==width*height||output.length!==source.length||
    source.length% (width*4)!==0||
    !Number.isSafeInteger(sourceStartY)||!Number.isSafeInteger(firstY)||
    !Number.isSafeInteger(rows)||rows<0||sourceStartY<0||firstY<sourceStartY||
    firstY+rows>height||firstY+rows>sourceStartY+source.length/(width*4)||
    !Number.isFinite(strength)||strength>1)
    throw new Error("Invalid edge decontamination region.");
  const sourceLastY=sourceStartY+source.length/(width*4);
  const samples=3;
  for(let y=firstY;y<firstY+rows;y++)for(let x=0;x<width;x++){
    const alpha=mask[y*width+x]/255;
    if(alpha<=0||alpha>=1)continue;
    let found=-1,best=alpha+.2;
    for(let step=1;step<=samples;step++)for(const [dx,dy] of [
      [-step,0],[step,0],[0,-step],[0,step]
    ]){
      const nx=x+dx,ny=y+dy;
      if(nx<0||nx>=width||ny<sourceStartY||ny>=sourceLastY||
        ny<0||ny>=height)continue;
      const candidate=mask[ny*width+nx]/255;
      if(candidate>best){best=candidate;found=((ny-sourceStartY)*width+nx)*4;}
    }
    if(found>=0){
      const pixel=((y-sourceStartY)*width+x)*4;
      const blend=strength*(1-alpha);
      for(let channel=0;channel<3;channel++)
        output[pixel+channel]=Math.round(
          source[pixel+channel]*(1-blend)+source[found+channel]*blend);
    }
  }
}
