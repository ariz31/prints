import type {TextLayer} from "./layers.ts";
import {PDF_POINTS_PER_MM} from "./layout.ts";
export interface TextBoxGeometry {
  lines:string[];
  widthPt:number;
  heightPt:number;
  lineHeightPt:number;
  fontSizePt:number;
}
/**
 * A single physical text-box model for PNG and PDF.
 * Units are typographic points, independent of PNG's raster resolution.
 */
export function textBoxGeometry(
 layer:TextLayer,productWidthMm:number,productHeightMm:number,
):TextBoxGeometry{
 if(![productWidthMm,productHeightMm,layer.width,layer.height,layer.fontSizePt]
   .every(value=>Number.isFinite(value)&&value>0))
   throw new Error("Text layer has invalid physical dimensions.");
 return {
  lines:layer.text.split("\n"),
  widthPt:layer.width*productWidthMm*PDF_POINTS_PER_MM,
  heightPt:layer.height*productHeightMm*PDF_POINTS_PER_MM,
  lineHeightPt:layer.fontSizePt*1.2,
  fontSizePt:layer.fontSizePt,
 };
}
/** Returns the first problem, or null for a layer fitting its physical box. */
export function textOverflow(
 box:TextBoxGeometry,measureWidthPt?:(text:string,sizePt:number)=>number,
):"height"|"width"|null{
 if(box.lines.length*box.lineHeightPt>box.heightPt+0.001)return "height";
 if(measureWidthPt&&box.lines.some(line=>
   measureWidthPt(line,box.fontSizePt)>box.widthPt+0.001))return "width";
 return null;
}
export function assertTextFits(
 box:TextBoxGeometry,measureWidthPt?:(text:string,sizePt:number)=>number,
):void{
 const issue=textOverflow(box,measureWidthPt);
 if(issue)throw new Error(issue==="height"
  ?"Text exceeds its design box height. Enlarge the layer or reduce the font size."
  :"Text exceeds its design box width. Enlarge the layer or reduce the font size.");
}
