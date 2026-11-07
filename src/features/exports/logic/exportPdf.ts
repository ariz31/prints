import {validExportDpi} from "../../../core/dpi.ts";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import type {PDFFont} from "pdf-lib";
import type {Font} from "@pdf-lib/fontkit";
import {decodeLocalFont} from "../../../core/fontAssets.ts";
import {fetchBundledFont} from "../../../core/bundledFonts.ts";
import {drawFramePdf} from "../../../core/framePdf.ts";
import {makeShapedPdfPainter,shapePdfLine} from "../../../core/shapedPdfText.ts";
import type {ShapedPdfLine} from "../../../core/shapedPdfText.ts";
import { layerRectMm, parseHexColor } from "../../../core/layers.ts";
import type { TextLayer } from "../../../core/layers.ts";
import type { PDFImage } from "pdf-lib";
import { PDF_POINTS_PER_MM } from "../../../core/layout.ts";
import { textBoxGeometry,assertTextFits } from "../../../core/textLayout.ts";
import { rasterizeCrop } from "../../../core/imageRaster.ts";
import {createHighResolutionRaster,requestedRasterDimensions} from "../../../core/highResRaster.ts";
import {clockwiseTilePlacement} from "../../../core/pdfTileGeometry.ts";
import type { SheetPage } from "../../../core/layout.ts";
import { cornerCutLines,validateCornerMarkClearance } from "../../../core/cutMarks.ts";
import type { TrimStyle, TrimLine } from "../../../core/cutMarks.ts";
import { NOTEPAD_CUT_GUIDE_STYLE } from "../../../core/notepadLayout.ts";
import {shapePolygonMm} from "../../../core/cropShapes.ts";
import {drawStudioFramePdf,pdfPhotoWithoutVectorFrame} from "../../crop/logic/studioPdfFrame.ts";

import type { PhotoAsset } from "../../../domain/models/asset.ts";
export type { PhotoAsset };

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
  outputDpi:number=300,
  options:{signal?:AbortSignal;onProgress?:(completed:number,total:number)=>void;notepadCuts?:readonly TrimLine[];lightCutMarks?:boolean}={},
): Promise<Blob> {
  const checkCanceled=()=>{
    if(options.signal?.aborted)throw new Error("PDF export canceled.");
  };
  checkCanceled();
  if(!validExportDpi(outputDpi))throw new Error("PDF resolution must be an integer from 72 to 1200 DPI.");
  if(trimStyle!=="outline"&&trimStyle!=="corner")
    throw new Error("Unknown cut-mark style.");
  if(cutGuides&&trimStyle==="corner"&&!options.notepadCuts){
    if(!spacing)throw new Error("Corner cut marks require known paper margin and spacing.");
    validateCornerMarkClearance(spacing.marginMm,spacing.gapMm);
  }
  if(new Set(assets.map(asset=>asset.id)).size!==assets.length||
     assets.some(asset=>typeof asset.id!=="string"||!asset.id.trim()||asset.id.length>200))
    throw new Error("PDF export requires unique valid design IDs.");
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
  const chunk=768;
  const totalWork=pages.length+relevant.reduce((total,asset)=>{
    const {width,height}=requestedRasterDimensions(asset.widthMm,asset.heightMm,outputDpi);
    const tiled=width>3000||height>3000||width*height>9_000_000;
    return total+(tiled?Math.ceil(width/chunk)*Math.ceil(height/chunk):1);
  },0);
  let completed=0;
  const progress=()=>{
    completed++;
    options.onProgress?.(completed,totalWork);
    checkCanceled();
  };
  options.onProgress?.(0,totalWork);
  checkCanceled();
  const doc = await PDFDocument.create();
  const serialFont=pages.some(pg=>pg.placements.some(p=>p.serial))
    ?await doc.embedFont(StandardFonts.HelveticaBold):null;
  const defaultFont = await doc.embedFont(StandardFonts.Helvetica);
  type FontResource={font:PDFFont;source?:Font};
  const fontCache=new Map<string,FontResource>([["Helvetica",{font:defaultFont}]]);
  let fontKit:typeof import("@pdf-lib/fontkit")|undefined;
  async function fontFor(layer:TextLayer):Promise<FontResource>{
    const key=layer.fontData??(layer.bundledFontId?"bundled:"+layer.bundledFontId:layer.fontFamily??"Helvetica");
    const cached=fontCache.get(key);if(cached)return cached;
    let result:FontResource;
    if(layer.fontData||layer.bundledFontId){
      if(!fontKit){
        fontKit=(await import("@pdf-lib/fontkit")).default;
        doc.registerFontkit(fontKit);
      }
      const bytes=layer.fontData?decodeLocalFont(layer.fontData):
        await fetchBundledFont(layer.bundledFontId!,import.meta.env?.BASE_URL??"/");
      try{result={font:await doc.embedFont(bytes,{subset:true}),source:fontKit.create(bytes)};}
      catch{throw new Error("Cannot embed this TTF/OTF font. Check its license and format.");}
    }else{
      result={font:await doc.embedFont(layer.fontFamily==="Courier"?StandardFonts.Courier:
        layer.fontFamily==="TimesRoman"?StandardFonts.TimesRoman:StandardFonts.Helvetica)};
    }
    fontCache.set(key,result);return result;
  }
  doc.setTitle("PRINTS Sheet Layout");
  doc.setCreator("PRINTS - Local Print Studio");
  const byId = new Map(assets.map((a) => [a.id, a]));
  const cache = new Map<string, PDFImage>();
  // A design may appear hundreds of times on a sheet. Reuse shaped lines while
  // bounding retained geometry across large batches of distinct text layers.
  const shapedCache=new Map<string,ShapedPdfLine[]>();
  type Tile={x:number;y:number;width:number;height:number;image:PDFImage};
  const tileCache=new Map<string,{totalW:number;totalH:number;tiles:Tile[]}>();
  async function embeddedTiles(asset:PhotoAsset){
   const prior=tileCache.get(asset.id);
   if(prior)return prior;
   const raster=await createHighResolutionRaster(pdfPhotoWithoutVectorFrame(asset),outputDpi);
   const tiles:Tile[]=[];
   try{
   for(let y=0;y<raster.height;y+=chunk)for(let x=0;x<raster.width;x+=chunk){
    checkCanceled();
    const width=Math.min(chunk,raster.width-x),height=Math.min(chunk,raster.height-y);
    const png=new Uint8Array(await (await raster.png(x,y,width,height)).arrayBuffer());
    tiles.push({x,y,width,height,image:await doc.embedPng(png)});
    progress();
   }
   }finally{raster.dispose();}
   const result={totalW:raster.width,totalH:raster.height,tiles};
   tileCache.set(asset.id,result);
   return result;
  }
  for (const pageLayout of pages) {
    checkCanceled();
    const heightPt = mmToPoints(paper.heightMm);
    const page = doc.addPage([mmToPoints(paper.widthMm), heightPt]);
    const painterCache=new Map<string,ReturnType<typeof makeShapedPdfPainter>>();
    for (const placement of pageLayout.placements) {
      const asset = byId.get(placement.itemId);
      if (!asset) throw new Error("A sheet placement references a missing image.");
      const desired=requestedRasterDimensions(asset.widthMm,asset.heightMm,outputDpi);
      const tiled=desired.width>3000||desired.height>3000||
        desired.width*desired.height>9_000_000;
      let png=cache.get(asset.id);
      if(!tiled&&!png){
        checkCanceled();
        png=await doc.embedPng(new Uint8Array(await (await rasterize(pdfPhotoWithoutVectorFrame(asset), outputDpi)).arrayBuffer()));
        cache.set(asset.id,png);
        progress();
      }
      const x = mmToPoints(placement.xMm);
      const y = heightPt - mmToPoints(placement.yMm + placement.heightMm);
      const width = mmToPoints(placement.widthMm);
      const height = mmToPoints(placement.heightMm);
      if((asset.cropPolygon || (asset.cropShape&&asset.cropShape!=="rectangle"))&&(asset.layers??[]).some(layer=>layer.visible))
        throw new Error("Shaped crops with visible design layers are not supported. Hide the layers before exporting.");
      if(placement.rotated&&(asset.layers??[]).some(layer=>layer.visible))
        throw new Error("Rotating layered designs is not supported.");
      if(tiled){
        const group=await embeddedTiles(asset);
        for(const tile of group.tiles){
         if(placement.rotated){
          // Browser preview uses rotate(90deg) (clockwise); PDF coordinates
          // require a negative angle and a top-left-anchored tile.
          const tileBounds=clockwiseTilePlacement(
            {x,y,width,height},tile,{width:group.totalW,height:group.totalH});
          page.drawImage(tile.image,{...tileBounds,rotate:degrees(-90)});
         }else page.drawImage(tile.image,{
          x:x+tile.x/group.totalW*width,
          y:y+(1-(tile.y+tile.height)/group.totalH)*height,
          width:tile.width/group.totalW*width,
          height:tile.height/group.totalH*height,
         });
        }
      }else{
        if(!png)throw new Error("Missing rasterized image.");
        if(placement.rotated){
          const bounds=clockwiseTilePlacement(
            {x,y,width,height},{x:0,y:0,width:desired.width,height:desired.height},
            {width:desired.width,height:desired.height});
          page.drawImage(png,{...bounds,rotate:degrees(-90)});
        }else page.drawImage(png, { x, y, width, height });
      }
      drawStudioFramePdf(page,asset,placement,heightPt);
      for (const layer of asset.layers ?? []) {
        if (!layer.visible) continue;
        const position = layerRectMm(layer, placement);
        const left = mmToPoints(position.xMm);
        const bottom = heightPt - mmToPoints(position.yMm + position.heightMm);
        const layerWidth = mmToPoints(position.widthMm);
        const layerHeight = mmToPoints(position.heightMm);
        const [red, green, blue] = parseHexColor(layer.color);
        const color = rgb(red, green, blue);
        if (layer.kind === "frame") {
          drawFramePdf(page,{frameId:layer.frameId,weight:layer.weight,inset:layer.inset,spacing:layer.spacing,
            widthMm:position.widthMm,heightMm:position.heightMm,
            left,top:bottom+layerHeight,color,opacity:layer.opacity??1});
        } else if (layer.kind === "rectangle") {
          page.drawRectangle({ x: left, y: bottom, width: layerWidth, height: layerHeight, color, opacity:layer.opacity??1 });
        } else if (layer.kind === "ellipse") {
          page.drawEllipse({
            x: left + layerWidth / 2, y: bottom + layerHeight / 2,
            xScale: layerWidth / 2, yScale: layerHeight / 2, color,opacity:layer.opacity??1,
          });
        } else if (layer.kind === "text") {
          const box=textBoxGeometry(layer,placement.widthMm,placement.heightMm);
          const {font,source}=await fontFor(layer);
          const shapeKey=JSON.stringify([asset.id,layer.id]);
          let shaped=source?shapedCache.get(shapeKey):undefined;
          if(source&&!shaped){
            shaped=box.lines.map(text=>shapePdfLine(font,source,text,layer.fontSizePt));
            if(shapedCache.size>=100)shapedCache.delete(shapedCache.keys().next().value!);
            shapedCache.set(shapeKey,shaped);
          }
          const shapedByText=shaped?new Map(box.lines.map((text,index)=>[text,shaped[index]])):undefined;
          assertTextFits(box,(text,size)=>shapedByText?.get(text)?.width??font.widthOfTextAtSize(text,size));
          const painterKey=JSON.stringify([font.ref.toString(),layer.fontSizePt,layer.opacity??1]);
          let paintShaped=shaped?painterCache.get(painterKey):undefined;
          if(shaped&&!paintShaped){
            paintShaped=makeShapedPdfPainter(page,font,layer.fontSizePt,layer.opacity??1);
            painterCache.set(painterKey,paintShaped);
          }
          const stroke=layer.outlinePt??0,shadow=layer.shadowPt??0;
          const sRgb=layer.shadowColor?parseHexColor(layer.shadowColor):[0.12,0.12,0.12];
          const oRgb=layer.outlineColor?parseHexColor(layer.outlineColor):[1,1,1];
          const shadowColor=rgb(sRgb[0],sRgb[1],sRgb[2]);
          const outlineColor=rgb(oRgb[0],oRgb[1],oRgb[2]);
          for(let line=0;line<box.lines.length;line++){
            const text=box.lines[line];
            const measured=shaped?.[line].width??font.widthOfTextAtSize(text,layer.fontSizePt);
            const xText=left+(layer.align==="center"?(layerWidth-measured)/2:
              layer.align==="right"?layerWidth-measured:0);
            const yText=bottom+layerHeight-layer.fontSizePt-line*box.lineHeightPt;
            const paint=(x:number,y:number,color:typeof shadowColor)=>{
              if(shaped&&paintShaped)paintShaped(shaped[line],x,y,color);
              else page.drawText(text,{x,y,font,size:layer.fontSizePt,color,opacity:layer.opacity??1});
            };
            if(shadow>0)paint(xText+shadow,yText-shadow,shadowColor);
            if(stroke>0){
              // Vector outline approximated by eight tightly offset glyph draws.
              for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-.7,-.7],[.7,-.7],[-.7,.7],[.7,.7]]){
                paint(xText+dx*stroke,yText+dy*stroke,outlineColor);
              }
            }
            paint(xText,yText,color);
          }
        }
      }
      if(placement.serial){
        const serial=placement.serial;
        if(placement.rotated||!serialFont||typeof serial.text!=="string"||
           serial.text.length<1||serial.text.length>45||!/^[\x20-\x7e]+$/.test(serial.text)||
           ![serial.xPercent,serial.yPercent,serial.fontSizePt].every(Number.isFinite)||
           serial.xPercent<0||serial.xPercent>100||serial.yPercent<0||serial.yPercent>100||
           serial.fontSizePt<5||serial.fontSizePt>30)
          throw new Error("Ticket numbering contains an unsupported label or placement.");
        const textWidth=serialFont.widthOfTextAtSize(serial.text,serial.fontSizePt);
        const padding=mmToPoints(1);
        if(textWidth>width-2*padding||serial.fontSizePt>height-2*padding)
          throw new Error("Ticket serial does not fit the cut piece. Reduce its font size or length.");
        const xText=Math.max(x+padding,Math.min(x+width-padding-textWidth,
          x+width*serial.xPercent/100-textWidth/2));
        const yText=Math.max(y+padding,Math.min(y+height-padding-serial.fontSizePt,
          y+height*(1-serial.yPercent/100)-serial.fontSizePt/2));
        page.drawText(serial.text,{x:xText,y:yText,
          font:serialFont,size:serial.fontSizePt,color:rgb(.1,.1,.1)});
      }
      if(cutGuides && (asset.cropPolygon || (asset.cropShape&&asset.cropShape!=="rectangle"))){
        const boundary=shapePolygonMm(asset.cropShape,placement.xMm,placement.yMm,
          placement.widthMm,placement.heightMm,!!placement.rotated,asset.cropPolygon);
        for(let i=0;i<boundary.length;i++){
          const a=boundary[i],b=boundary[(i+1)%boundary.length];
          page.drawLine({start:{x:mmToPoints(a.x),y:heightPt-mmToPoints(a.y)},
            end:{x:mmToPoints(b.x),y:heightPt-mmToPoints(b.y)},
            thickness:0.15,color:rgb(.82,.82,.82)});
        }
      }else if(cutGuides && !options.notepadCuts && trimStyle==="outline"){
        page.drawRectangle({x,y,width,height,
          borderColor:options.lightCutMarks?rgb(.82,.82,.82):rgb(.43,.49,.56),
           borderWidth:options.lightCutMarks ? 0.15 : 0.2});
      }else if(cutGuides && !options.notepadCuts && trimStyle==="corner"){
        for(const segment of cornerCutLines(placement)){
          page.drawLine({
            start:{x:mmToPoints(segment.x1),y:heightPt-mmToPoints(segment.y1)},
            end:{x:mmToPoints(segment.x2),y:heightPt-mmToPoints(segment.y2)},
            thickness:options.lightCutMarks ? 0.15 : 0.27,
             color:options.lightCutMarks?rgb(.82,.82,.82):rgb(.24,.28,.30),
          });
        }
      }
    }
    if(cutGuides&&options.notepadCuts){
      const [guideRed,guideGreen,guideBlue]=parseHexColor(NOTEPAD_CUT_GUIDE_STYLE.color);
      const guideColor=rgb(guideRed,guideGreen,guideBlue);
      for(const segment of options.notepadCuts){
        if(![segment.x1,segment.y1,segment.x2,segment.y2].every(Number.isFinite))
          throw new Error("Invalid notepad cut coordinates.");
        page.drawLine({
          start:{x:mmToPoints(segment.x1),y:heightPt-mmToPoints(segment.y1)},
          end:{x:mmToPoints(segment.x2),y:heightPt-mmToPoints(segment.y2)},
          thickness:NOTEPAD_CUT_GUIDE_STYLE.pdfStrokePt,color:guideColor,
        });
      }
    }
    progress();
  }
  checkCanceled();
  const bytes = await doc.save();
  checkCanceled();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
