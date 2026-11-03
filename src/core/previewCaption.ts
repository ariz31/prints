import type {Orientation} from "./layout.ts";

export interface PreviewCaptionSettings {
  paperLabel:string;
  orientation:Orientation;
  sheetIndex:number;
  sheetCount:number;
  itemCount:number;
  copies:number;
  utilizationPercent:number;
}

/** Display-only metadata. Print geometry and quantities remain owned by the sheet composer. */
export function formatPreviewCaption({
  paperLabel,orientation,sheetIndex,sheetCount,itemCount,copies,utilizationPercent,
}:PreviewCaptionSettings):string{
  const direction=orientation==="landscape"?"Landscape":"Portrait";
  return `${paperLabel} · ${direction} · Sheet ${sheetIndex}/${sheetCount} · ${itemCount} ${itemCount===1?"item":"items"} · ${copies} ${copies===1?"copy":"copies"} · ${utilizationPercent}% used`;
}
