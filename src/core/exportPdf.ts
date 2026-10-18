import { PDFDocument, rgb } from "pdf-lib";
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
