/** Non-destructive, identical image adjustments for canvas preview and PDF. */
export interface PhotoAdjustments {
 brightness:number;contrast:number;saturation:number;
}
export const DEFAULT_ADJUSTMENTS:PhotoAdjustments={
 brightness:0,contrast:0,saturation:0,
};
export function validPhotoAdjustments(input:unknown):input is PhotoAdjustments {
 if(!input||typeof input!=="object")return false;
 const p=input as Record<string,unknown>;
 return ["brightness","contrast"].every(k=>typeof p[k]==="number"&&
   Number.isFinite(p[k])&&(p[k] as number)>=-100&&(p[k] as number)<=100)&&
   typeof p.saturation==="number"&&Number.isFinite(p.saturation)&&
   p.saturation>=-100&&p.saturation<=200;
}
export function photoFilterCss(value?:PhotoAdjustments):string {
 if(value===undefined)return "none";
 if(!validPhotoAdjustments(value))throw new Error("Invalid photo adjustments");
 const b=(100+value.brightness)/100;
 const c=(100+value.contrast)/100;
 const s=(100+value.saturation)/100;
 return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

/**
 * Require the same CSS filter pipeline in canvas-backed PNG/PDF exports.
 * Browsers without CanvasRenderingContext2D.filter otherwise silently export
 * unadjusted pixels while showing the user a filtered CSS image preview.
 */
export function setCanvasPhotoFilter(
 context:Pick<CanvasRenderingContext2D,"filter">,value?:PhotoAdjustments,
):void {
 const filter=photoFilterCss(value);
 if(!value||Object.values(value).every(v=>v===0)){
   context.filter="none";
   return;
 }
 context.filter=filter;
 if(typeof context.filter!=="string" || context.filter==="none"){
   throw new Error("This browser cannot export photo adjustments accurately. Use an updated browser or reset adjustments before exporting.");
 }
}
