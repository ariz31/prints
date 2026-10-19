import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { layerRectMm, parseHexColor } from "./layers.ts";
import type { DesignLayer } from "./layers.ts";
import type { PDFImage } from "pdf-lib";
import { PDF_POINTS_PER_MM } from "./layout.ts";
import { textBoxGeometry,assertTextFits } from "./textLayout.ts";
import type { CropRegion } from "./crop.ts";
import { rasterizeCrop, rasterDimensions } from "./imageRaster.ts";
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
    const {width,height}=rasterDimensions(asset.widthMm,asset.heightMm,300);
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
  for (const pageLayout of pages) {
    const heightPt = mmToPoints(paper.heightMm);
    const page = doc.addPage([mmToPoints(paper.widthMm), heightPt]);
    for (const placement of pageLayout.placements) {
      const asset = byId.get(placement.itemId);
      if (!asset) throw new Error("A sheet placement references a missing image.");
      let png = cache.get(asset.id);
      if (!png) {
        png = await doc.embedPng(new Uint8Array(await (await rasterize(asset, 300)).arrayBuffer()));
        cache.set(asset.id, png);
      }
      const x = mmToPoints(placement.xMm);
      const y = heightPt - mmToPoints(placement.yMm + placement.heightMm);
      const width = mmToPoints(placement.widthMm);
      const height = mmToPoints(placement.heightMm);
      page.drawImage(png, { x, y, width, height });
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
