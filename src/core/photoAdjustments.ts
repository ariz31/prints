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
