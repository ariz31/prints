/** Versioned, non-destructive photo adjustments.
 * The original three fields remain mandatory for legacy project/workflow parity.
 * Additional numeric controls are optional and default to neutral (zero). */
export interface LocalRetouch {
 /** Crop-local normalized coordinates; shown and placed in Print crop mode. */
 kind:"light"|"heal"|"red-eye";
 x:number;y:number;radius:number;strength:number;
}
export interface PhotoAdjustments {
 brightness:number;contrast:number;saturation:number;
 exposure?:number;highlights?:number;shadows?:number;whites?:number;blacks?:number;
 temperature?:number;tint?:number;vibrance?:number;
 sharpness?:number;denoise?:number;
 grayscale?:number;vignette?:number;
 rotation?:number;straighten?:number;flipX?:boolean;flipY?:boolean;
 regions?:LocalRetouch[];
 backgroundColor?:string;
}
export const DEFAULT_ADJUSTMENTS:PhotoAdjustments={brightness:0,contrast:0,saturation:0};
export const PHOTO_CONTROLS={
 brightness:{min:-100,max:100,label:"Brightness",category:"Light"},
 contrast:{min:-100,max:100,label:"Contrast",category:"Light"},
 exposure:{min:-200,max:200,label:"Exposure",category:"Light"},
 highlights:{min:-100,max:100,label:"Highlights",category:"Light"},
 shadows:{min:-100,max:100,label:"Shadows",category:"Light"},
 whites:{min:-100,max:100,label:"Whites",category:"Light"},
 blacks:{min:-100,max:100,label:"Blacks",category:"Light"},
 temperature:{min:-100,max:100,label:"Temperature",category:"Color"},
 tint:{min:-100,max:100,label:"Tint",category:"Color"},
 vibrance:{min:-100,max:100,label:"Vibrance",category:"Color"},
 saturation:{min:-100,max:200,label:"Saturation",category:"Color"},
 sharpness:{min:0,max:100,label:"Sharpen",category:"Detail"},
 denoise:{min:0,max:100,label:"Noise reduction",category:"Detail"},
 grayscale:{min:0,max:100,label:"Black and white",category:"Tools"},
 vignette:{min:-100,max:100,label:"Vignette",category:"Tools"},
} as const;
export type PhotoControl=keyof typeof PHOTO_CONTROLS;
const VALID_FIELDS=new Set<string>([...Object.keys(PHOTO_CONTROLS),"rotation","straighten","flipX","flipY","regions","backgroundColor"]);
export function validPhotoAdjustments(input:unknown):input is PhotoAdjustments{
 if(!input||typeof input!=="object"||Array.isArray(input))return false;
 const p=input as Record<string,unknown>;
 if(Object.keys(p).some(key=>!VALID_FIELDS.has(key)))return false;
 for(const [key,bounds] of Object.entries(PHOTO_CONTROLS)){
  if((p[key]===undefined)&&!(key==="brightness"||key==="contrast"||key==="saturation"))continue;
  if(typeof p[key]!=="number"||!Number.isFinite(p[key])||
    (p[key] as number)<bounds.min||(p[key] as number)>bounds.max)return false;
 }
 if(p.rotation!==undefined&&![0,90,180,270].includes(p.rotation as number))return false;
 if(p.straighten!==undefined&&
   (typeof p.straighten!=="number"||!Number.isFinite(p.straighten)||
     p.straighten< -15||p.straighten>15))return false;
 if(p.flipX!==undefined&&typeof p.flipX!=="boolean")return false;
 if(p.flipY!==undefined&&typeof p.flipY!=="boolean")return false;
 if(p.backgroundColor!==undefined&&(typeof p.backgroundColor!=="string"||
    !/^#[0-9a-f]{6}$/i.test(p.backgroundColor)))return false;
 if(p.regions!==undefined){
  if(!Array.isArray(p.regions)||p.regions.length>20)return false;
  for(const region of p.regions){
   if(!region||typeof region!=="object"||Array.isArray(region))return false;
   const r=region as Record<string,unknown>;
   if(!["light","heal","red-eye"].includes(String(r.kind))||
     Object.keys(r).some(k=>!["kind","x","y","radius","strength"].includes(k)))return false;
   for(const key of ["x","y","radius","strength"]){
    if(typeof r[key]!=="number"||!Number.isFinite(r[key]))return false;
   }
   if((r.x as number)<0||(r.x as number)>1||
      (r.y as number)<0||(r.y as number)>1||
      (r.radius as number)<=0||(r.radius as number)>.25||
      (r.strength as number)<-100||(r.strength as number)>100)return false;
  }
 }
 return true;
}
export function normalizeAdjustments(p?:PhotoAdjustments):PhotoAdjustments{
 if(p&&!validPhotoAdjustments(p))throw new Error("Invalid photo adjustments");
 return {...DEFAULT_ADJUSTMENTS,...p};
}
export function isNeutralAdjustment(p?:PhotoAdjustments):boolean{
 if(!p)return true;
 return Object.entries(p).every(([key,value])=>key==="regions"?(!value||!(value as LocalRetouch[]).length):
   key==="backgroundColor"?value===undefined:
   key==="flipX"||key==="flipY"
   ?value===false:typeof value==="number"&&value===0);
}
export function needsPixelProcessing(p?:PhotoAdjustments):boolean{
 if(!p)return false;
 if(p.backgroundColor||p.regions?.length)return true;
 return Object.keys(PHOTO_CONTROLS).some(key=>!["brightness","contrast","saturation"].includes(key)
  &&(p[key as PhotoControl]??0)!==0);
}
export function hasGeometryTransform(p?:PhotoAdjustments):boolean{
 return !!(p?.rotation||p?.straighten||p?.flipX||p?.flipY);
}
/** Preserve the legacy browser filter sequence exactly. All output paths use it once. */
export function photoFilterCss(value?:PhotoAdjustments):string{
 if(value===undefined)return "none";
 if(!validPhotoAdjustments(value))throw new Error("Invalid photo adjustments");
 const b=(100+value.brightness)/100;
 const c=(100+value.contrast)/100;
 const s=(100+value.saturation)/100;
 return `brightness(${b}) contrast(${c}) saturate(${s})`;
}
export function setCanvasPhotoFilter(
 context:Pick<CanvasRenderingContext2D,"filter">,value?:PhotoAdjustments,
):void{
 const filter=photoFilterCss(value);
 if(!value||[value.brightness,value.contrast,value.saturation].every(v=>v===0)){
  context.filter="none";return;
 }
 if(!("filter" in context))throw new Error("This browser does not support accurate Canvas photo filters. Update your browser or reset adjustments before exporting.");
 context.filter=filter;
 if(typeof context.filter!=="string"||context.filter==="none")
  throw new Error("This browser cannot export photo adjustments accurately. Use an updated browser or reset adjustments before exporting.");
}
export const PHOTO_PRESETS:ReadonlyArray<{id:string;label:string;value:PhotoAdjustments}>=[
 {id:"neutral",label:"Original",value:{...DEFAULT_ADJUSTMENTS}},
 {id:"portrait",label:"Portrait",value:{...DEFAULT_ADJUSTMENTS,exposure:10,shadows:12,highlights:-14,temperature:8,vibrance:9,denoise:12}},
 {id:"document",label:"Document",value:{...DEFAULT_ADJUSTMENTS,contrast:16,whites:18,sharpness:20,saturation:-35}},
 {id:"vivid",label:"Vivid",value:{...DEFAULT_ADJUSTMENTS,contrast:11,vibrance:35,sharpness:12}},
 {id:"mono",label:"B&W",value:{...DEFAULT_ADJUSTMENTS,contrast:12,grayscale:100}},
 {id:"soft",label:"Soft",value:{...DEFAULT_ADJUSTMENTS,contrast:-8,highlights:-16,shadows:17,denoise:20}},
];
/** On-device, deterministic heuristic: sample source pixels, not face identity. */
export function autoEnhanceFromImage(image:ImageData):PhotoAdjustments{
 const d=image.data;let n=0,sum=0,low=255,high=0,sumR=0,sumG=0,sumB=0;
 const stride=Math.max(1,Math.floor(d.length/(4*3500)));
 for(let i=0;i<d.length;i+=stride*4){
  if(d[i+3]<64)continue;
  const lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
  sum+=lum;low=Math.min(low,lum);high=Math.max(high,lum);
  sumR+=d[i];sumG+=d[i+1];sumB+=d[i+2];n++;
 }
 if(!n)return {...DEFAULT_ADJUSTMENTS};
 const mean=sum/n,range=high-low;
 const target=128;
 const exposure=Math.round(Math.max(-45,Math.min(45,100*Math.log2(target/Math.max(12,mean)))));
 const contrast=Math.round(Math.max(-12,Math.min(22,(160-range)/4)));
 const whiteBalance=(sumR-sumB)/n;
 return {...DEFAULT_ADJUSTMENTS,exposure,contrast,highlights:-12,shadows:10,
  temperature:Math.round(Math.max(-20,Math.min(20,-whiteBalance*.3))),vibrance:12};
}

/** Conservative cover ratio for a rotated print rectangle (avoids corner gaps). */
export function rotationCoverScale(width:number,height:number,degrees:number):number{
 if(![width,height,degrees].every(Number.isFinite)||width<=0||height<=0)
  throw new Error("Invalid rotation geometry.");
 const theta=degrees*Math.PI/180,c=Math.abs(Math.cos(theta)),s=Math.abs(Math.sin(theta));
 return Math.max(1,(c*width+s*height)/width,(s*width+c*height)/height);
}
