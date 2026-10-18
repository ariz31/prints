import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { layerRectMm, parseHexColor } from "./layers.ts";
import type { DesignLayer } from "./layers.ts";
import type { PDFImage } from "pdf-lib";
import { PDF_POINTS_PER_MM } from "./layout.ts";
import type { CropRegion } from "./crop.ts";
import { rasterizeCrop } from "./imageRaster.ts";
import type { SheetPage, PrintItemSpec } from "./layout.ts";

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
): Promise<Blob> {
  if (pages.length === 0) throw new Error("Add an image and quantity before exporting.");
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
        png = await doc.embedPng(new Uint8Array(await (await rasterizeCrop(asset, 300)).arrayBuffer()));
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
        } else {
          const lines = layer.text.split("\\n");
          for (const line of lines) {
            if (textFont.widthOfTextAtSize(line, layer.fontSizePt) > layerWidth + 0.001) {
              throw new Error("A text layer exceeds its text box. Reduce the font size or enlarge the layer.");
            }
          }
          if (lines.length * layer.fontSizePt * 1.2 > layerHeight + 0.001) {
            throw new Error("A text layer exceeds its height. Resize the layer or reduce the font size.");
          }
          page.drawText(layer.text, {
            x: left, y: bottom + layerHeight - layer.fontSizePt,
            font: textFont, size: layer.fontSizePt, color, lineHeight: layer.fontSizePt * 1.2,
          });
        }
      }
      if (cutGuides) {
        page.drawRectangle({
          x, y, width, height,
          borderColor: rgb(0.43, 0.49, 0.56),
          borderWidth: 0.2,
        });
      }
    }
  }
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
