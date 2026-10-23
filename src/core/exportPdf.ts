import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import { layerRectMm, parseHexColor } from "./layers.ts";
import type { DesignLayer } from "./layers.ts";
import type { PDFImage } from "pdf-lib";
import { PDF_POINTS_PER_MM } from "./layout.ts";
import { textBoxGeometry,assertTextFits } from "./textLayout.ts";
import type { CropRegion } from "./crop.ts";
import { rasterizeCrop } from "./imageRaster.ts";
import {createHighResolutionRaster,requestedRasterDimensions} from "./highResRaster.ts";
import type { PhotoAdjustments } from "./photoAdjustments.ts";
import type { SheetPage, PrintItemSpec } from "./layout.ts";
import { cornerCutLines,validateCornerMarkClearance } from "./cutMarks.ts";
import type { TrimStyle } from "./cutMarks.ts";

export interface PhotoAsset extends PrintItemSpec {
  name: string;
  url: string;
  pixelWidth: number;
  pixelHeight: number;
  crop: CropRegion;
  processedUrl?: string;
  processedWidth?: number;
  processedHeight?: number;
  layers?: DesignLayer[];
  adjustments?: PhotoAdjustments;
  focalX: number;
  focalY: number;
}

function mmToPoints(value: number): number {
  return value * PDF_POINTS_PER_MM;
}

export async function exportToPdf(
  assets: ReadonlyArray<PhotoAsset>,
  pages: ReadonlyArray<SheetPage>,
  paper: { widthMm: number; heightMm: number },
  cutGuides: boolean,
  rasterize: (asset:PhotoAsset,dpi:number)=>Promise<Blob> = rasterizeCrop,
  trimStyle: TrimStyle = "outline",
  spacing?: {marginMm:number;gapMm:number},
  outputDpi:300|600=300,
): Promise<Blob> {
  if(trimStyle!=="outline"&&trimStyle!=="corner")
    throw new Error("Unknown cut-mark style.");
  if(cutGuides&&trimStyle==="corner"){
    if(!spacing)throw new Error("Corner cut marks require known paper margin and spacing.");
    validateCornerMarkClearance(spacing.marginMm,spacing.gapMm);
  }
  if (pages.length === 0) throw new Error("Add an image and quantity before exporting.");
  if (pages.length > 200) throw new Error("Jobs over 200 sheets must be split into smaller batches.");
  const used=new Set(pages.flatMap(page=>page.placements.map(p=>p.itemId)));
  const relevant=assets.filter(a=>used.has(a.id));
  // Keep decoded PNG and pdf-lib memory bounded on mobile devices.
  const projectedPixels=relevant.reduce((sum,asset)=>{
    const {width,height}=requestedRasterDimensions(asset.widthMm,asset.heightMm,outputDpi);
    return sum+width*height;
  },0);
  if(projectedPixels>120_000_000)
    throw new Error("This job requires too much image memory. Export fewer or smaller designs per batch.");
  const doc = await PDFDocument.create();
  const textFont = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle("PRINTS Sheet Layout");
  doc.setCreator("PRINTS - Local Print Studio");
  const byId = new Map(assets.map((a) => [a.id, a]));
  const cache = new Map<string, PDFImage>();
  type Tile={x:number;y:number;width:number;height:number;image:PDFImage};
  const tileCache=new Map<string,{totalW:number;totalH:number;tiles:Tile[]}>();
  async function embeddedTiles(asset:PhotoAsset){
   const prior=tileCache.get(asset.id);
   if(prior)return prior;
   const raster=await createHighResolutionRaster(asset,outputDpi);
   const tiles:Tile[]=[];
   const chunk=768; // <= 0.6 MP per transient tile.
   for(let y=0;y<raster.height;y+=chunk)for(let x=0;x<raster.width;x+=chunk){
    const width=Math.min(chunk,raster.width-x),height=Math.min(chunk,raster.height-y);
    const png=new Uint8Array(await (await raster.png(x,y,width,height)).arrayBuffer());
    tiles.push({x,y,width,height,image:await doc.embedPng(png)});
   }
   const result={totalW:raster.width,totalH:raster.height,tiles};
   tileCache.set(asset.id,result);
   return result;
  }
  for (const pageLayout of pages) {
    const heightPt = mmToPoints(paper.heightMm);
    const page = doc.addPage([mmToPoints(paper.widthMm), heightPt]);
    for (const placement of pageLayout.placements) {
      const asset = byId.get(placement.itemId);
      if (!asset) throw new Error("A sheet placement references a missing image.");
      const desired=requestedRasterDimensions(asset.widthMm,asset.heightMm,outputDpi);
      const tiled=desired.width>3000||desired.height>3000||
        desired.width*desired.height>9_000_000;
      let png=cache.get(asset.id);
      if(!tiled&&!png){
        png=await doc.embedPng(new Uint8Array(await (await rasterize(asset, outputDpi)).arrayBuffer()));
        cache.set(asset.id,png);
      }
      const x = mmToPoints(placement.xMm);
      const y = heightPt - mmToPoints(placement.yMm + placement.heightMm);
      const width = mmToPoints(placement.widthMm);
      const height = mmToPoints(placement.heightMm);
      if(placement.rotated&&(asset.layers??[]).some(layer=>layer.visible))
        throw new Error("Rotating layered designs is not supported.");
      if(tiled){
        const group=await embeddedTiles(asset);
        for(const tile of group.tiles){
         if(placement.rotated){
          page.drawImage(tile.image,{
           x:x+(tile.y+tile.height)/group.totalH*width,
           y:y+tile.x/group.totalW*height,
           width:tile.width/group.totalW*height,
           height:tile.height/group.totalH*width,
           rotate:degrees(90),
          });
         }else page.drawImage(tile.image,{
          x:x+tile.x/group.totalW*width,
          y:y+(1-(tile.y+tile.height)/group.totalH)*height,
          width:tile.width/group.totalW*width,
          height:tile.height/group.totalH*height,
         });
        }
      }else{
        if(!png)throw new Error("Missing rasterized image.");
        if(placement.rotated)page.drawImage(png,{x:x+width,y,width:height,height:width,rotate:degrees(90)});
        else page.drawImage(png, { x, y, width, height });
      }
      for (const layer of asset.layers ?? []) {
        if (!layer.visible) continue;
        const position = layerRectMm(layer, placement);
        const left = mmToPoints(position.xMm);
        const bottom = heightPt - mmToPoints(position.yMm + position.heightMm);
        const layerWidth = mmToPoints(position.widthMm);
        const layerHeight = mmToPoints(position.heightMm);
        const [red, green, blue] = parseHexColor(layer.color);
        const color = rgb(red, green, blue);
        if (layer.kind === "rectangle") {
          page.drawRectangle({ x: left, y: bottom, width: layerWidth, height: layerHeight, color });
        } else if (layer.kind === "ellipse") {
          page.drawEllipse({
            x: left + layerWidth / 2, y: bottom + layerHeight / 2,
            xScale: layerWidth / 2, yScale: layerHeight / 2, color,
          });
        } else if (layer.kind === "text") {
          const box=textBoxGeometry(layer,placement.widthMm,placement.heightMm);
          assertTextFits(box,(text,size)=>textFont.widthOfTextAtSize(text,size));
          page.drawText(layer.text, {
            x: left, y: bottom + layerHeight - layer.fontSizePt,
            font: textFont, size: layer.fontSizePt, color, lineHeight: box.lineHeightPt,
          });
        }
      }
      if(cutGuides && trimStyle==="outline"){
        page.drawRectangle({x,y,width,height,
          borderColor:rgb(.43,.49,.56),borderWidth:.2});
      }else if(cutGuides && trimStyle==="corner"){
        for(const segment of cornerCutLines(placement)){
          page.drawLine({
            start:{x:mmToPoints(segment.x1),y:heightPt-mmToPoints(segment.y1)},
            end:{x:mmToPoints(segment.x2),y:heightPt-mmToPoints(segment.y2)},
            thickness:.27,color:rgb(.24,.28,.30),
          });
        }
      }
    }
  }
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
