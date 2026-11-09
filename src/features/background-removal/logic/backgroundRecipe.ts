/** PRINTS Background Remover v2: portable, versioned, resolution-independent edits. */
export interface MaskGrid {width:number;height:number;encoded:string}
export interface MaskPoint {x:number;y:number}
export interface MaskStroke {
  points:MaskPoint[];mode:"erase"|"restore";
  /** Radius is a fraction of the shorter image dimension. */
  radius:number;hardness:number;opacity:number;snap:boolean;
}
export interface BackgroundRecipe {
  version:2;
  segmentationMode?:"person"|"object"|"color";
  /** The baseline mask is independent of the source pixels and replacement backdrop. */
  alpha:MaskGrid;
  confidence?:MaskGrid;
  strokes:MaskStroke[];
  threshold:number;softness:number;
  feather:number;contract:number;decontam:number;
  backdrop:{
    kind:"transparent"|"color"|"image";
    color?:string;
    /** Self-contained, size-limited backdrop so project and ZIP backups remain portable. */
    dataUrl?:string;fit?:"cover"|"contain";offsetX?:number;offsetY?:number;
  };
}
export const MAX_MASK_PIXELS=2_560_000;
const clamp=(n:number,a=0,b=1)=>Math.min(b,Math.max(a,n));
const validSize=(w:number,h:number)=>Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>0&&h>0&&w*h<=MAX_MASK_PIXELS;
export function encodeMask(data:Uint8Array,width:number,height:number):MaskGrid{
  if(!validSize(width,height)||data.length!==width*height)throw new Error("Invalid mask dimensions.");
  // Count runs without constructing a potentially huge number[]; photo masks
  // may have millions of alternating alpha values near detailed hair edges.
  let runCount=0;
  for(let i=0;i<data.length;){
    const value=data[i];let length=1;
    while(i+length<data.length&&data[i+length]===value&&length<65535)length++;
    runCount++;i+=length;
  }
  const rle=runCount*3<data.length;
  const packed=new Uint8Array(1+(rle?runCount*3:data.length));
  if(rle){
    packed[0]=1;let at=1;
    for(let i=0;i<data.length;){
      const value=data[i];let length=1;
      while(i+length<data.length&&data[i+length]===value&&length<65535)length++;
      packed[at++]=length>>8;packed[at++]=length&255;packed[at++]=value;
      i+=length;
    }
  }else{packed[0]=0;packed.set(data,1);}
  // Chunk size is divisible by three, so the base64 fragments concatenate correctly.
  const parts:string[]=[];
  for(let i=0;i<packed.length;i+=24576)
    parts.push(btoa(String.fromCharCode(...packed.subarray(i,i+24576))));
  return {width,height,encoded:parts.join("")};
}
export function decodeMask(grid:MaskGrid):Uint8Array{
  if(!grid||!validSize(grid.width,grid.height)||typeof grid.encoded!=="string"||
    grid.encoded.length===0||grid.encoded.length>MAX_MASK_PIXELS*4/3+128||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(grid.encoded))throw new Error("Invalid saved mask.");
  const decoded=atob(grid.encoded);const output=new Uint8Array(grid.width*grid.height);
  if(decoded.charCodeAt(0)===0){
    if(decoded.length!==output.length+1)throw new Error("Invalid raw mask length.");
    for(let i=0;i<output.length;i++)output[i]=decoded.charCodeAt(i+1);
  }else if(decoded.charCodeAt(0)===1){
    if((decoded.length-1)%3!==0)throw new Error("Malformed run-length mask.");
    let offset=0;
    for(let i=1;i<decoded.length;i+=3){
      const len=(decoded.charCodeAt(i)<<8)|decoded.charCodeAt(i+1);
      if(!len||offset+len>output.length)throw new Error("Invalid mask run.");
      output.fill(decoded.charCodeAt(i+2),offset,offset+len);offset+=len;
    }
    if(offset!==output.length)throw new Error("Incomplete saved mask.");
  }else throw new Error("Unknown mask encoding.");
  return output;
}
export function sampleAlpha(data:Uint8Array,w:number,h:number,x:number,y:number):number{
  const px=clamp(x)*(w-1),py=clamp(y)*(h-1);
  const x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);
  const fx=px-x0,fy=py-y0;
  return ((data[y0*w+x0]*(1-fx)+data[y0*w+x1]*fx)*(1-fy)+
    (data[y1*w+x0]*(1-fx)+data[y1*w+x1]*fx)*fy);
}
/** Apply alpha controls before manual strokes: subsequent AI adjustments cannot discard corrections. */
export function confidenceToAlpha(data:Uint8Array,threshold:number,softness:number):Uint8Array{
  const out=new Uint8Array(data.length);
  const t=clamp(threshold,.1,.9),s=clamp(softness,.01,.5);
  for(let i=0;i<data.length;i++)out[i]=Math.round(clamp((data[i]/255-t)/s+.5)*255);
  return out;
}
export function baseMask(recipe:BackgroundRecipe):{width:number;height:number;alpha:Uint8Array}{
  const grid=recipe.confidence??recipe.alpha;
  const data=decodeMask(grid);
  return {width:grid.width,height:grid.height,alpha:recipe.confidence?
    confidenceToAlpha(data,recipe.threshold,recipe.softness):data};
}
/** Rasterize a continuous pointer path. A sparse move event must not leave holes
 * at full export resolution even when the preview used fewer sampled events. */
export function applyStroke(alpha:Uint8Array,width:number,height:number,stroke:MaskStroke):void{
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    alpha.length!==width*height||!stroke||!Array.isArray(stroke.points)||
    stroke.points.length>15000)throw new Error("Invalid mask stroke.");
  const r=clamp(stroke.radius,.0001,.5)*Math.min(width,height);
  const hard=clamp(stroke.hardness),opacity=clamp(stroke.opacity);
  const target=stroke.mode==="restore"?255:0;
  if(!["erase","restore"].includes(stroke.mode))throw new Error("Invalid mask brush mode.");
  const stamp=(cx:number,cy:number)=>{
    const x0=Math.max(0,Math.floor(cx-r)),x1=Math.min(width-1,Math.ceil(cx+r));
    const y0=Math.max(0,Math.floor(cy-r)),y1=Math.min(height-1,Math.ceil(cy+r));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const distance=Math.hypot(x-cx,y-cy)/Math.max(1e-6,r);
      if(distance>1)continue;
      const falloff=distance<=hard?1:(1-distance)/Math.max(1e-6,1-hard);
      const a=opacity*clamp(falloff),i=y*width+x;
      alpha[i]=Math.round(alpha[i]*(1-a)+target*a);
    }
  };
  let last:{x:number;y:number}|null=null;
  for(const point of stroke.points){
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
    const next={x:clamp(point.x)*(width-1),y:clamp(point.y)*(height-1)};
    if(last){
      const steps=Math.max(1,Math.ceil(Math.hypot(next.x-last.x,next.y-last.y)/
        Math.max(1,r*.35)));
      for(let j=1;j<=steps;j++)
        stamp(last.x+(next.x-last.x)*j/steps,last.y+(next.y-last.y)*j/steps);
    }else stamp(next.x,next.y);
    last=next;
  }
}

export function renderMask(recipe:BackgroundRecipe,width:number,height:number,includeStrokes=true):Uint8Array{
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width*height>40_000_000)throw new Error("Invalid output mask dimensions.");
  const base=baseMask(recipe);
  const alpha=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    alpha[y*width+x]=Math.round(sampleAlpha(base.alpha,base.width,base.height,
      width===1?0:x/(width-1),height===1?0:y/(height-1)));
  if(includeStrokes)for(const stroke of recipe.strokes)applyStroke(alpha,width,height,stroke);
  return alpha;
}
export function validBackgroundRecipe(recipe:unknown):recipe is BackgroundRecipe{
  if(!recipe||typeof recipe!=="object")return false;
  const r=recipe as BackgroundRecipe;
  try{
    if(r.version!==2||(r.segmentationMode!==undefined&&!["person","object","color"].includes(r.segmentationMode))||!r.alpha||!Array.isArray(r.strokes)||r.strokes.length>2500||
       !Number.isFinite(r.threshold)||r.threshold<.1||r.threshold>.9||
       !Number.isFinite(r.softness)||r.softness<.01||r.softness>.5||
       !Number.isInteger(r.feather)||r.feather<0||r.feather>6||
       !Number.isInteger(r.contract)||Math.abs(r.contract)>4||
       !Number.isFinite(r.decontam)||r.decontam<0||r.decontam>1||
       !r.backdrop||!["transparent","color","image"].includes(r.backdrop.kind))return false;
    if(r.backdrop.dataUrl && (r.backdrop.dataUrl.length>12_000_000||
       !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(r.backdrop.dataUrl)))return false;
    if(r.backdrop.kind==="image"&&!r.backdrop.dataUrl)return false;
    if(r.backdrop.fit!==undefined&&!["cover","contain"].includes(r.backdrop.fit))return false;
    for(const value of [r.backdrop.offsetX,r.backdrop.offsetY])
      if(value!==undefined&&(!Number.isFinite(value)||value< -1||value>1))return false;
    if(r.backdrop.color&& !/^#[0-9a-fA-F]{6}$/.test(r.backdrop.color))return false;
    if(r.confidence)decodeMask(r.confidence);
    decodeMask(r.alpha);
    if(r.strokes.reduce((total,s)=>total+(Array.isArray(s?.points)?s.points.length:250001),0)>250000)
      return false;
    return r.strokes.every(s=>["erase","restore"].includes(s.mode)&&
      s.points.length<=15000&&s.points.every(p=>Number.isFinite(p.x)&&p.x>=0&&p.x<=1&&
       Number.isFinite(p.y)&&p.y>=0&&p.y<=1)&&
      Number.isFinite(s.radius)&&s.radius>0&&s.radius<=.5&&
      Number.isFinite(s.hardness)&&s.hardness>=0&&s.hardness<=1&&
      Number.isFinite(s.opacity)&&s.opacity>=0&&s.opacity<=1);
  }catch{return false;}
}
export function defaultBackgroundRecipe(alpha:Uint8Array,width:number,height:number):BackgroundRecipe{
  return {version:2,segmentationMode:"color",alpha:encodeMask(alpha,width,height),strokes:[],
    threshold:.5,softness:.15,feather:0,contract:0,decontam:0,
    backdrop:{kind:"transparent"}};
}
