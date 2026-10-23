/** Normalized placement shared by the live editor and the final processed PNG. */
export type BackdropFit="cover"|"contain";
export function backgroundImageRect(
 imageWidth:number,imageHeight:number,canvasWidth:number,canvasHeight:number,
 fit:BackdropFit="cover",offsetX=0,offsetY=0,
){
 const args=[imageWidth,imageHeight,canvasWidth,canvasHeight,offsetX,offsetY];
 if(args.some(v=>!Number.isFinite(v))||imageWidth<=0||imageHeight<=0||
  canvasWidth<=0||canvasHeight<=0||(fit!=="cover"&&fit!=="contain")||
  offsetX< -1||offsetX>1||offsetY< -1||offsetY>1)
   throw new Error("Invalid local background image geometry.");
 const scale=(fit==="cover"
  ?Math.max(canvasWidth/imageWidth,canvasHeight/imageHeight)
  :Math.min(canvasWidth/imageWidth,canvasHeight/imageHeight));
 const width=imageWidth*scale,height=imageHeight*scale;
 return {
  x:(canvasWidth-width)/2+offsetX*Math.abs(canvasWidth-width)/2,
  y:(canvasHeight-height)/2+offsetY*Math.abs(canvasHeight-height)/2,
  width,height,
 };
}
