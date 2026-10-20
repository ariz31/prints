/** Strict form parsing: a blank entry is not the numeric value zero. */
export function parseBoundedNumber(
 raw:string,min:number,max:number,integer=false,
):number|null {
 if(!raw.trim()||!Number.isFinite(min)||!Number.isFinite(max)||min>max)return null;
 const n=Number(raw);
 if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n)))return null;
 return n;
}

export interface NumberBounds {min:number;max:number;integer?:boolean}
export function workflowParameterBounds(key:string):NumberBounds{
 switch(key){
  case "quantity":return {min:1,max:1000,integer:true};
  case "widthMm":case "heightMm":case "customWidthMm":case "customHeightMm":
   return {min:0.01,max:2000};
  case "marginMm":case "gapMm":return {min:0,max:1999.999};
  case "focalX":case "focalY":return {min:0,max:100};
  case "brightness":case "contrast":return {min:-100,max:100};
  case "saturation":return {min:-100,max:200};
  default:return {min:-1000000,max:1000000};
 }
}
