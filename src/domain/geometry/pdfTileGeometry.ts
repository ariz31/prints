/**
 * Position a raster tile on a PDF page with a CLOCKWISE 90° visual rotation
 * (matching the HTML preview's CSS rotate(90deg)).
 *
 * PDF coordinates start at the lower-left, while source tile coordinates
 * start at the upper-left. A -90° pdf-lib rotation needs an anchor at the
 * top-left of each rotated rectangle in PDF coordinates.
 */
export interface Rect {x:number;y:number;width:number;height:number}
export interface SourceTile {x:number;y:number;width:number;height:number}
export function clockwiseTilePlacement(
 frame:Rect,tile:SourceTile,raster:{width:number;height:number},
):Rect {
 const values=[frame.x,frame.y,frame.width,frame.height,tile.x,tile.y,
  tile.width,tile.height,raster.width,raster.height];
 if(!values.every(Number.isFinite)||frame.width<=0||frame.height<=0||
  raster.width<=0||raster.height<=0||tile.width<=0||tile.height<=0||
  tile.x<0||tile.y<0||tile.x+tile.width>raster.width+1e-8||
  tile.y+tile.height>raster.height+1e-8)
   throw new Error("Invalid rotated print tile geometry.");
 return {
  x:frame.x+(1-(tile.y+tile.height)/raster.height)*frame.width,
  y:frame.y+(1-tile.x/raster.width)*frame.height,
  width:tile.width/raster.width*frame.height,
  height:tile.height/raster.height*frame.width,
 };
}
