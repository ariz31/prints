/**
 * Smartphone-style crop: a stationary print frame with the image moved
 * and zoomed underneath. Normalized source coordinates are authoritative.
 */
export interface CropRegion { x: number; y: number; width: number; height: number }
export const FULL_CROP: CropRegion = { x: 0, y: 0, width: 1, height: 1 };
export function normalizeCrop(crop: CropRegion): CropRegion {
  if (![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)) return { ...FULL_CROP };
  const x=Math.max(0,Math.min(.99,crop.x)),y=Math.max(0,Math.min(.99,crop.y));
  return {x,y,width:Math.max(.01,Math.min(1-x,crop.width)),height:Math.max(.01,Math.min(1-y,crop.height))};
}
function assertDims(...values: number[]) {
  if (!values.every(n=>Number.isFinite(n)&&n>0)) throw new Error("Image and output dimensions must be positive.");
}
/** Fit a visible crop to physical output ratio, around the previously visible center. */
export function fitCropToAspect(crop: CropRegion, imgW:number,imgH:number,outW:number,outH:number):CropRegion {
  assertDims(imgW,imgH,outW,outH);
  const region=normalizeCrop(crop);
  const ratio=outW*imgH/(outH*imgW); // normalized crop width/height
  let w=region.width,h=region.height;
  if(w/h>ratio) w=h*ratio; else h=w/ratio;
  const cx=region.x+region.width/2,cy=region.y+region.height/2;
  return {x:Math.max(0,Math.min(1-w,cx-w/2)),y:Math.max(0,Math.min(1-h,cy-h/2)),width:w,height:h};
}
export function panCrop(crop:CropRegion, deltaScreenX:number,deltaScreenY:number):CropRegion {
  const c=normalizeCrop(crop);
  return {...c,x:Math.max(0,Math.min(1-c.width,c.x-deltaScreenX*c.width)),
    y:Math.max(0,Math.min(1-c.height,c.y-deltaScreenY*c.height))};
}
export function zoomCrop(crop:CropRegion, factor:number,anchorX=.5,anchorY=.5):CropRegion {
  if(!Number.isFinite(factor)||factor<=0)throw new Error("Invalid crop zoom.");
  const c=normalizeCrop(crop);
  const anchor={x:Math.max(0,Math.min(1,anchorX)),y:Math.max(0,Math.min(1,anchorY))};
  const maxWidth=Math.min(1,c.width/c.height);
  const w=Math.max(maxWidth/8,Math.min(maxWidth,c.width/factor));
  const h=w*c.height/c.width;
  return {x:Math.max(0,Math.min(1-w,c.x+(c.width-w)*anchor.x)),
    y:Math.max(0,Math.min(1-h,c.y+(c.height-h)*anchor.y)),width:w,height:h};
}
/** Extract the EXACT displayed rectangle. This must not apply object-fit cover again. */
export function exactCropSourceRect(imgW:number,imgH:number,crop:CropRegion,outW:number,outH:number) {
  assertDims(imgW,imgH,outW,outH);
  if (![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite) ||
      crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||
      crop.x+crop.width>1.000001||crop.y+crop.height>1.000001) {
    throw new Error("Invalid crop bounds. Edit the image crop.");
  }
  const actual=crop.width*imgW/(crop.height*imgH);
  if(Math.abs(actual/(outW/outH)-1)>0.002) {
    throw new Error("Crop and print shape differ. Open Crop to review before printing.");
  }
  return {sx:crop.x*imgW,sy:crop.y*imgH,sw:crop.width*imgW,sh:crop.height*imgH};
}
// Legacy compatibility only; never use this method for output or live crop preview.
export function dragCrop(start:{x:number;y:number},end:{x:number;y:number},minExtent=.01):CropRegion {
  const sx=Math.max(0,Math.min(1,start.x)),sy=Math.max(0,Math.min(1,start.y));
  const ex=Math.max(0,Math.min(1,end.x)),ey=Math.max(0,Math.min(1,end.y));
  const x=Math.min(sx,ex),y=Math.min(sy,ey);
  return normalizeCrop({x,y,width:Math.max(minExtent,Math.abs(ex-sx)),height:Math.max(minExtent,Math.abs(ey-sy))});
}
export function coverSourceRect(
  naturalWidth:number,naturalHeight:number,crop:CropRegion,
  outputWidth:number,outputHeight:number,focalX=50,focalY=50,
){
  assertDims(naturalWidth,naturalHeight,outputWidth,outputHeight);
  const c=normalizeCrop(crop),initialW=naturalWidth*c.width,initialH=naturalHeight*c.height,ratio=outputWidth/outputHeight;
  let sw=initialW,sh=initialH;
  if(initialW/initialH>ratio)sw=initialH*ratio;else sh=initialW/ratio;
  const fx=Math.max(0,Math.min(1,focalX/100)),fy=Math.max(0,Math.min(1,focalY/100));
  return {sx:naturalWidth*c.x+(initialW-sw)*fx,sy:naturalHeight*c.y+(initialH-sh)*fy,sw,sh};
}
