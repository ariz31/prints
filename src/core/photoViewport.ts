/**
 * View-only Photo Studio transforms. These never modify a saved crop or pixels.
 * Coordinates are CSS pixels relative to the preview stage, whose contents
 * are centered at its midpoint with CSS transform-origin: center.
 */
export interface ViewPoint {x:number;y:number}
export interface ViewSize {width:number;height:number}
export interface PreviewView {scale:number;x:number;y:number}
export const MIN_PREVIEW_SCALE=1;
export const MAX_PREVIEW_SCALE=2.5;
export const INITIAL_PREVIEW_VIEW:PreviewView={scale:1,x:0,y:0};

const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const midpoint=(a:ViewPoint,b:ViewPoint):ViewPoint=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const distance=(a:ViewPoint,b:ViewPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

/**
 * Do not expose empty workspace around a zoomed photo. A contained portrait
 * may be narrower than the stage, so it must not drift horizontally until its
 * rendered content actually exceeds the available viewport.
 */
export function clampPreviewView(view:PreviewView,stage:ViewSize,content:ViewSize):PreviewView{
 const scale=clamp(finite(view.scale,1),MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE);
 if(scale===1)return {...INITIAL_PREVIEW_VIEW};
 const boundX=Math.max(0,(Math.max(0,finite(content.width))*scale-Math.max(0,finite(stage.width)))/2);
 const boundY=Math.max(0,(Math.max(0,finite(content.height))*scale-Math.max(0,finite(stage.height)))/2);
 return {
  scale,
  x:clamp(finite(view.x),-boundX,boundX),
  y:clamp(finite(view.y),-boundY,boundY),
 };
}

export function panPreviewView(
 view:PreviewView,dx:number,dy:number,stage:ViewSize,content:ViewSize,
):PreviewView{
 return clampPreviewView({
  ...view,x:view.x+finite(dx),y:view.y+finite(dy),
 },stage,content);
}

/**
 * Preserve the scene point under the moving gesture midpoint, then clamp
 * translation against the real displayed photo/frame (not its source pixels).
 * Both pointer pairs must retain the same stable pointer-ID ordering.
 */
export function pinchPreviewView(
 view:PreviewView,before:[ViewPoint,ViewPoint],after:[ViewPoint,ViewPoint],
 stage:ViewSize,content:ViewSize,
):PreviewView{
 const initialDistance=distance(before[0],before[1]);
 const finalDistance=distance(after[0],after[1]);
 if(!Number.isFinite(initialDistance)||!Number.isFinite(finalDistance)||
    initialDistance<1||finalDistance<1)return view;
 const oldScale=clamp(finite(view.scale,1),MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE);
 const newScale=clamp(oldScale*finalDistance/initialDistance,MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE);
 const from=midpoint(before[0],before[1]),to=midpoint(after[0],after[1]);
 const center={x:stage.width/2,y:stage.height/2},ratio=newScale/oldScale;
 return clampPreviewView({
  scale:newScale,
  x:to.x-center.x-(from.x-center.x-view.x)*ratio,
  y:to.y-center.y-(from.y-center.y-view.y)*ratio,
 },stage,content);
}

/** Slider zoom is centered, just like a two-finger pinch at stage center. */
export function zoomPreviewView(view:PreviewView,scale:number,stage:ViewSize,content:ViewSize):PreviewView{
 const next=clamp(finite(scale,1),MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE);
 const old=clamp(finite(view.scale,1),MIN_PREVIEW_SCALE,MAX_PREVIEW_SCALE);
 return clampPreviewView({scale:next,x:view.x*next/old,y:view.y*next/old},stage,content);
}
