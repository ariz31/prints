/** Raster sampling density, not the effective resolution of the source photo. */
export const DPI_PRESETS=[
 {value:72,label:"72 DPI",detail:"Screen / proof"},
 {value:96,label:"96 DPI",detail:"Digital documents"},
 {value:150,label:"150 DPI",detail:"Draft printing"},
 {value:200,label:"200 DPI",detail:"Everyday documents"},
 {value:300,label:"300 DPI",detail:"Standard quality"},
 {value:450,label:"450 DPI",detail:"Fine graphics"},
 {value:600,label:"600 DPI",detail:"High detail"},
 {value:1200,label:"1200 DPI",detail:"Specialized output"},
] as const;
export const MIN_EXPORT_DPI=72;
export const MAX_EXPORT_DPI=1200;
export function validExportDpi(value:unknown):value is number{
 return typeof value==="number"&&Number.isSafeInteger(value)&&
   value>=MIN_EXPORT_DPI&&value<=MAX_EXPORT_DPI;
}
export function isPresetDpi(value:number):boolean{
 return DPI_PRESETS.some(item=>item.value===value);
}

/** Single source of truth for PDF, PNG, ZIP and the export UI. Mode settings
 * take priority; classic job DPI is the fallback when no mode is active. */
export function resolveOutputDpi(modeDpi?:number,classicDpi?:number):number{
 const dpi=modeDpi??classicDpi??300;
 if(!validExportDpi(dpi))throw new Error("Export DPI must be a whole number from 72 to 1200.");
 return dpi;
}
