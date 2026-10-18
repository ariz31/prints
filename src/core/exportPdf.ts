import { PDFDocument, rgb } from "pdf-lib";
import type { PDFImage } from "pdf-lib";
import { MM_PER_INCH, PDF_POINTS_PER_MM } from "./layout.ts";
import type { SheetPage, PrintItemSpec } from "./layout.ts";

export interface PhotoAsset extends PrintItemSpec {
  name: string;
  url: string;
  pixelWidth: number;
  pixelHeight: number;
  focalX: number;
  focalY: number;
}

function mmToPoints(value: number): number {
  return value * PDF_POINTS_PER_MM;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode one of the uploaded images."));
    image.src = url;
  });
}

/** Matches CSS object-fit: cover + object-position behavior in the preview. */
async function rasterizeCrop(asset: PhotoAsset): Promise<Uint8Array> {
  const image = await loadImage(asset.url);
  const requestedWidth = Math.max(1, Math.round((asset.widthMm / MM_PER_INCH) * 300));
  const requestedHeight = Math.max(1, Math.round((asset.heightMm / MM_PER_INCH) * 300));
  const scaleLimit = Math.min(1, 3000 / requestedWidth, 3000 / requestedHeight,
    Math.sqrt(9000000 / (requestedWidth * requestedHeight)));
  const width = Math.max(1, Math.round(requestedWidth * scaleLimit));
  const height = Math.max(1, Math.round(requestedHeight * scaleLimit));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device cannot create an image canvas.");
  const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnW = image.naturalWidth * cover;
  const drawnH = image.naturalHeight * cover;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image,
    (width - drawnW) * (asset.focalX / 100),
    (height - drawnH) * (asset.focalY / 100), drawnW, drawnH);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to encode image.")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
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
        png = await doc.embedPng(await rasterizeCrop(asset));
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
