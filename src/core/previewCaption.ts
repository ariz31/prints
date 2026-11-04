import type {Orientation} from "./layout.ts";

export interface PreviewCaptionSettings {
  paperLabel:string;
  orientation:Orientation;
  sheetIndex:number;
  sheetCount:number;
  itemCount:number;
  copies:number;
  utilizationPercent:number;
  printCoverage?:string;
}

/** Display-only metadata. Print geometry and quantities remain owned by the sheet composer. */
export function formatPreviewCaption({
  paperLabel,orientation,sheetIndex,sheetCount,itemCount,copies,utilizationPercent,printCoverage,
}:PreviewCaptionSettings):string{
  const direction=orientation==="landscape"?"Landscape":"Portrait";
  return `${paperLabel} · ${direction} · Sheet ${sheetIndex}/${sheetCount} · ${itemCount} ${itemCount===1?"item":"items"} · ${copies} ${copies===1?"copy":"copies"} · ${utilizationPercent}% used${printCoverage?" · "+printCoverage:""}`;
}

/** Report both errors and warnings in an accessible, concise control label. */
export function formatPreviewCheckStatus(errors:number,warnings:number):string{
  const counts=[
    ...(errors>0?[`${errors} ${errors===1?"error":"errors"}`]:[]),
    ...(warnings>0?[`${warnings} ${warnings===1?"warning":"warnings"}`]:[]),
  ];
  return "Print check: "+(counts.length?counts.join(", "):"Ready");
}
