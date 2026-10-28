import { PDFArray, PDFHexString, PDFNumber, PDFOperator, PDFOperatorNames,
  beginText, endText, popGraphicsState, pushGraphicsState,
  setFillingColor, setFontAndSize, setGraphicsState, setTextMatrix } from "pdf-lib";
import type { Color, PDFFont, PDFPage } from "pdf-lib";
import type { Font } from "@pdf-lib/fontkit";

/** Glyph coordinates and advance are in points relative to the line baseline. */
export interface ShapedPdfLine {
  width: number;
  glyphs: { code: string; x: number; y: number; advance: number }[];
}

/**
 * pdf-lib subsets the correctly substituted glyph IDs, but its normal text
 * drawing and width measurement omit fontkit's positioning adjustments.
 * Shape once, then position the same subset glyphs at their true advances.
 */
export function shapePdfLine(font: PDFFont, source: Font, text: string, size: number): ShapedPdfLine {
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (!source.hasGlyphForCodePoint(code)) {
      const hex = code.toString(16).toUpperCase().padStart(4, "0");
      throw new Error(`The selected font cannot display ${JSON.stringify(character)} (U+${hex}). Choose a font that supports this character.`);
    }
  }
  const run = source.layout(text);
  if (run.glyphs.some(glyph => glyph.id === 0))
    throw new Error("The selected font cannot render some of this text. Choose another font.");
  const encoded = font.encodeText(text).asString();
  if (run.positions.length !== run.glyphs.length || encoded.length !== run.glyphs.length * 4)
    throw new Error("The font could not be laid out safely for PDF export.");
  const scale = size / source.unitsPerEm;
  let x = 0, y = 0;
  const glyphs = run.positions.map((position, index) => {
    const glyph = { code: encoded.slice(index * 4, index * 4 + 4),
      x: (x + position.xOffset) * scale, y: (y + position.yOffset) * scale,
      advance: run.glyphs[index].advanceWidth * scale };
    x += position.xAdvance;
    y += position.yAdvance;
    return glyph;
  });
  return { width: x * scale, glyphs };
}

/** A page-local painter keeps the frame of reference and opacity for every pass. */
export function makeShapedPdfPainter(page: PDFPage, font: PDFFont, size: number, opacity: number) {
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  const graphicsState = page.node.newExtGState("GS", page.doc.context.obj({ Type: "ExtGState", ca: opacity }));
  return (line: ShapedPdfLine, x: number, y: number, color: Color) => {
    if (!line.glyphs.length) return;
    page.pushOperators(pushGraphicsState(), setGraphicsState(graphicsState), beginText(),
      setFillingColor(color), setFontAndSize(fontKey, size));
    // Most lines fit one TJ run. The numeric adjustments compensate for the
    // difference between embedded glyph widths and fontkit's shaped positions.
    // A new matrix is needed only when a glyph has a different vertical offset.
    let start = 0;
    while (start < line.glyphs.length) {
      let end = start + 1;
      while (end < line.glyphs.length && Math.abs(line.glyphs[end].y - line.glyphs[start].y) < 1e-7) end++;
      const parts=PDFArray.withContext(page.doc.context);
      let hex="";
      for (let index=start;index<end;index++) {
        const glyph=line.glyphs[index];
        hex+=glyph.code;
        if(index+1<end){
          const adjustment=(glyph.x+glyph.advance-line.glyphs[index+1].x)*1000/size;
          if(Math.abs(adjustment)>1e-7){
            parts.push(PDFHexString.of(hex));parts.push(PDFNumber.of(adjustment));hex="";
          }
        }
      }
      if(hex)parts.push(PDFHexString.of(hex));
      page.pushOperators(setTextMatrix(1,0,0,1,x+line.glyphs[start].x,y+line.glyphs[start].y),
        PDFOperator.of(PDFOperatorNames.ShowTextAdjusted,[parts]));
      start=end;
    }
    page.pushOperators(endText(), popGraphicsState());
  };
}
