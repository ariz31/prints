import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PDF_POINTS_PER_MM } from "./layout.ts";

const pt = (mm: number) => mm * PDF_POINTS_PER_MM;

export function validateCalibrationPaper(paper: { widthMm: number; heightMm: number }): void {
  if (!Number.isFinite(paper.widthMm) || !Number.isFinite(paper.heightMm) ||
      paper.widthMm < 145 || paper.heightMm < 180 ||
      paper.widthMm > 2000 || paper.heightMm > 2000) {
    throw new Error("Calibration sheet requires a paper size at least 145 × 180 mm.");
  }
}

/**
 * A printable ruler/2-inch square test sheet. It measures printer-driver
 * scaling and alignment only; it cannot override hardware nonprintable areas.
 */
export async function createCalibrationPdf(paper: { widthMm: number; heightMm: number }): Promise<Blob> {
  validateCalibrationPaper(paper);
  const doc = await PDFDocument.create();
  const page = doc.addPage([pt(paper.widthMm), pt(paper.heightMm)]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const dark = rgb(0.12, 0.18, 0.24);
  const gray = rgb(.45, .53, .60);
  const w = pt(paper.widthMm), h = pt(paper.heightMm);

  doc.setTitle("PRINTS — Actual-size printer calibration");
  doc.setCreator("PRINTS");

  page.drawText("PRINTS  /  PRINT SCALE CALIBRATION", {
    x: pt(16), y: h - pt(19), size: 11, font, color: dark,
  });
  page.drawText("Print at 100% / Actual Size — disable Fit to Page.", {
    x: pt(16), y: h - pt(27), size: 8, font, color: gray,
  });
  page.drawText("Measure with a ruler; use the longest ticks as endpoints.", {
    x: pt(16), y: h - pt(32), size: 7, font, color: gray,
  });

  const x = pt(21);
  const y = h - pt(47);
  const hundred = pt(100);
  page.drawLine({ start: { x, y }, end: { x: x + hundred, y }, thickness: .7, color: dark });
  page.drawLine({ start: { x, y }, end: { x, y: y - hundred }, thickness: .7, color: dark });
  for (let index = 0; index <= 10; index++) {
    const shift = pt(index * 10);
    const tick = index % 5 === 0 ? pt(5) : pt(2.5);
    page.drawLine({ start: { x: x + shift, y: y - tick },
      end: { x: x + shift, y: y + tick }, thickness: .5, color: dark });
    page.drawLine({ start: { x: x - tick, y: y - shift },
      end: { x: x + tick, y: y - shift }, thickness: .5, color: dark });
  }
  page.drawText("100 mm horizontal", { x: x + pt(25), y: y + pt(9),
    size: 9, font, color: dark });
  page.drawText("100 mm vertical", { x: x + pt(7), y: y - pt(62),
    size: 9, font, color: dark });

  const side = pt(50.8);
  const squareX = w - pt(20) - side;
  const squareY = pt(43);
  page.drawRectangle({ x: squareX, y: squareY, width: side,
    height: side, borderWidth: .75, borderColor: dark });
  page.drawText("2 x 2 inches", { x: squareX + pt(4),
    y: squareY + side + pt(6), size: 9, font, color: dark });
  page.drawText("50.8 x 50.8 mm", { x: squareX + pt(4),
    y: squareY - pt(6), size: 8, font, color: gray });

  page.drawText("If measurements differ, check printer scaling and driver margins.", {
    x: pt(16), y: pt(24), size: 7.5, font, color: gray,
  });
  page.drawText("Keep this sheet as a reference for future print jobs.", {
    x: pt(16), y: pt(18), size: 7.5, font, color: gray,
  });
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
