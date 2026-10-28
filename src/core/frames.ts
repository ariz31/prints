/**
 * Print-local, vector frame designs. Coordinates and stroke widths are in mm
 * with a top-left origin. Motifs use the shorter side as their unit, so corners
 * and ornaments retain their proportions on portrait and landscape designs.
 */
export type FrameCategory = "Minimal" | "Classic" | "Geometric" | "Botanical" | "Celebratory";
export interface FramePreset { id: string; name: string; category: FrameCategory }
export interface FramePoint { x: number; y: number }
type Stroke = { strokeWidth: number };
export type FramePrimitive =
  | (Stroke & { kind: "line"; x1: number; y1: number; x2: number; y2: number })
  | (Stroke & { kind: "rect"; x: number; y: number; width: number; height: number; fill?: boolean })
  | (Stroke & { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill?: boolean })
  | (Stroke & { kind: "polyline"; points: FramePoint[] })
  | (Stroke & { kind: "polygon"; points: FramePoint[]; fill?: boolean });

/** IDs are persisted in projects: do not rename or reuse them. */
export const FRAME_PRESETS: readonly FramePreset[] = [
  { id: "hairline", name: "Hairline", category: "Minimal" },
  { id: "double-line", name: "Double line", category: "Minimal" },
  { id: "corner-lines", name: "Corner lines", category: "Minimal" },
  { id: "dashed", name: "Dashed", category: "Minimal" },
  { id: "dotted", name: "Dotted", category: "Minimal" },
  { id: "open-corners", name: "Open corners", category: "Minimal" },
  { id: "pinstripe", name: "Pinstripe", category: "Classic" },
  { id: "classic-corners", name: "Classic corners", category: "Classic" },
  { id: "deco", name: "Art deco", category: "Classic" },
  { id: "filigree", name: "Filigree", category: "Classic" },
  { id: "vintage-dots", name: "Vintage dots", category: "Classic" },
  { id: "stately", name: "Stately", category: "Classic" },
  { id: "diamonds", name: "Diamond chain", category: "Geometric" },
  { id: "triangles", name: "Triangle chain", category: "Geometric" },
  { id: "zigzag", name: "Zigzag", category: "Geometric" },
  { id: "squares", name: "Square chain", category: "Geometric" },
  { id: "hexagons", name: "Hexagon chain", category: "Geometric" },
  { id: "herringbone", name: "Herringbone", category: "Geometric" },
  { id: "leaf-tips", name: "Leaf tips", category: "Botanical" },
  { id: "corner-sprigs", name: "Corner sprigs", category: "Botanical" },
  { id: "leaf-garland", name: "Leaf garland", category: "Botanical" },
  { id: "flower-corners", name: "Flower corners", category: "Botanical" },
  { id: "floral-garland", name: "Floral garland", category: "Botanical" },
  { id: "vines", name: "Vines", category: "Botanical" },
  { id: "confetti", name: "Confetti", category: "Celebratory" },
  { id: "stars", name: "Stars", category: "Celebratory" },
  { id: "hearts", name: "Hearts", category: "Celebratory" },
  { id: "bunting", name: "Bunting", category: "Celebratory" },
  { id: "party-lights", name: "Party lights", category: "Celebratory" },
  { id: "sparkle", name: "Sparkle", category: "Celebratory" },
];
export const MIN_FRAME_WEIGHT = 0.5;
export const MAX_FRAME_WEIGHT = 2.5;
const frameIds = new Set(FRAME_PRESETS.map((preset) => preset.id));
export function isFramePresetId(value: unknown): value is string {
  return typeof value === "string" && frameIds.has(value);
}

/** All stroke extents are inset within the requested rectangle. */
export function createFrameGeometry(id: string, widthMm: number, heightMm: number, weight = 1): FramePrimitive[] {
  if (!isFramePresetId(id)) throw new Error("Unknown frame preset.");
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0)
    throw new Error("Frame dimensions must be positive and finite.");
  if (!Number.isFinite(weight) || weight < MIN_FRAME_WEIGHT || weight > MAX_FRAME_WEIGHT)
    throw new Error("Frame weight is outside its supported range.");
  const w = widthMm, h = heightMm, unit = Math.min(w, h);
  // Decorative designs need room for readable motifs on the outside of the line.
  const category = FRAME_PRESETS.find(preset => preset.id === id)!.category;
  const m = unit * (category === "Minimal" ? .045 : .075);
  const stroke = unit * .005 * weight;
  const p: FramePrimitive[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, factor = 1) =>
    p.push({ kind: "line", x1, y1, x2, y2, strokeWidth: stroke * factor });
  const rect = (inset: number, factor = 1) => p.push({ kind: "rect", x: inset, y: inset,
    width: w - 2 * inset, height: h - 2 * inset, strokeWidth: stroke * factor });
  const ellipse = (cx: number, cy: number, rx: number, ry: number, fill = false, factor = 1) =>
    p.push({ kind: "ellipse", cx, cy, rx, ry, fill, strokeWidth: stroke * factor });
  const poly = (points: FramePoint[], closed = false, fill = false, factor = 1) => {
    if (closed) p.push({ kind: "polygon", points, fill, strokeWidth: stroke * factor });
    else p.push({ kind: "polyline", points, strokeWidth: stroke * factor });
  };
  const diamond = (cx: number, cy: number, r: number, fill = false, factor = 1) =>
    poly([{ x: cx, y: cy - r }, { x: cx + r, y: cy }, { x: cx, y: cy + r },
      { x: cx - r, y: cy }], true, fill, factor);
  const corners = (draw: (x: number, y: number, sx: number, sy: number) => void) => {
    draw(m, m, 1, 1); draw(w - m, m, -1, 1);
    draw(m, h - m, 1, -1); draw(w - m, h - m, -1, -1);
  };
  // Motifs are evenly spaced, with a bound on total work for very long edges.
  const alongEdges = (spacing: number, draw: (x: number, y: number, horizontal: boolean, index: number) => void) => {
    const side = (length: number, horizontal: boolean, fixed: number) => {
      const count = Math.max(1, Math.min(24, Math.floor((length - 2 * m) / (unit * spacing))));
      for (let i = 0; i < count; i++) {
        const value = m + (i + .5) * (length - 2 * m) / count;
        draw(horizontal ? value : fixed, horizontal ? fixed : value, horizontal, i);
      }
    };
    side(w, true, m); side(w, true, h - m);
    side(h, false, m); side(h, false, w - m);
  };
  const regular = (cx: number, cy: number, radius: number, sides: number, phase = 0, inner?: number, fill = false) => {
    const points: FramePoint[] = [];
    const n = inner === undefined ? sides : sides * 2;
    for (let i = 0; i < n; i++) {
      const angle = phase + i * Math.PI * 2 / n;
      const r = inner !== undefined && i % 2 ? radius * inner : radius;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    poly(points, true, fill);
  };
  const leaf = (cx: number, cy: number, radius: number, angle: number, fill = false) => {
    const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
    poly([{ x: cx - dx * radius, y: cy - dy * radius },
      { x: cx + nx * radius * .34, y: cy + ny * radius * .34 },
      { x: cx + dx * radius, y: cy + dy * radius },
      { x: cx - nx * radius * .34, y: cy - ny * radius * .34 }], true, fill, .8);
  };
  const flower = (cx: number, cy: number, radius: number) => {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      ellipse(cx + Math.cos(angle) * radius * .55, cy + Math.sin(angle) * radius * .55,
        radius * .30, radius * .30, false, .8);
    }
    ellipse(cx, cy, radius * .15, radius * .15, true, .7);
  };
  const heart = (cx: number, cy: number, radius: number) => {
    const points: FramePoint[] = [];
    for (let i = 0; i < 28; i++) {
      const t = i * Math.PI * 2 / 28;
      points.push({ x: cx + radius * Math.pow(Math.sin(t), 3),
        y: cy - radius * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 17 });
    }
    poly(points, true, true, .8);
  };

  switch (id) {
    case "hairline": rect(m); break;
    case "double-line": rect(m); rect(m + unit * .018, .7); break;
    case "corner-lines": corners((x,y,sx,sy) => {
      line(x,y,x+sx*unit*.13,y); line(x,y,x,y+sy*unit*.13);
    }); break;
    case "dashed":
      alongEdges(.12, (x,y,horizontal) => horizontal
        ? line(x-unit*.027,y,x+unit*.027,y) : line(x,y-unit*.027,x,y+unit*.027)); break;
    case "dotted": alongEdges(.085,(x,y) => ellipse(x,y,unit*.0038,unit*.0038,true,.7)); break;
    case "open-corners": {
      const q=unit*.09;
      line(m+q,m,w-m-q,m); line(m+q,h-m,w-m-q,h-m);
      line(m,m+q,m,h-m-q); line(w-m,m+q,w-m,h-m-q);
      corners((x,y,sx,sy)=>diamond(x+sx*unit*.012,y+sy*unit*.012,unit*.009,true,.7));
      break;
    }
    case "pinstripe": rect(m,1.5); rect(m+unit*.025,.7); rect(m+unit*.05,.7); break;
    case "classic-corners": rect(m,.8); corners((x,y,sx,sy)=>{
      poly([{x:x+sx*unit*.16,y},{x:x+sx*unit*.04,y},
        {x:x+sx*unit*.04,y:y+sy*unit*.04},{x,y:y+sy*unit*.04},{x,y:y+sy*unit*.16}]);
      diamond(x+sx*unit*.052,y+sy*unit*.052,unit*.022,true,.8);
    }); break;
    case "deco": rect(m); rect(m+unit*.04,.7); corners((x,y,sx,sy)=>{
      for(let i=0;i<3;i++) line(x+sx*unit*(.025+i*.025),y+sy*unit*.014,
        x+sx*unit*.014,y+sy*unit*(.025+i*.025),1);
      diamond(x+sx*unit*.075,y+sy*unit*.075,unit*.025,true,.8);
    }); break;
    case "filigree": rect(m,.7); corners((x,y,sx,sy)=>{
      poly([{x:x+sx*unit*.17,y:y+sy*unit*.045},{x:x+sx*unit*.095,y:y+sy*unit*.045},
        {x:x+sx*unit*.045,y:y+sy*unit*.075},{x:x+sx*unit*.045,y:y+sy*unit*.17}],false,false,.9);
      ellipse(x+sx*unit*.08,y+sy*unit*.08,unit*.029,unit*.029,false,.9);
      diamond(x+sx*unit*.04,y+sy*unit*.04,unit*.018,true,.8);
    }); break;
    case "vintage-dots": rect(m,1.2); rect(m+unit*.04,.7);
      alongEdges(.17,(x,y)=>ellipse(x,y,unit*.017,unit*.017,true,.7)); break;
    case "stately": rect(m,1.8); rect(m+unit*.05,.8); corners((x,y,sx,sy)=>{
      poly([{x:x+sx*unit*.045,y:y+sy*unit*.16},{x:x+sx*unit*.045,y:y+sy*unit*.045},
        {x:x+sx*unit*.16,y:y+sy*unit*.045}],false,false,1.1);
      diamond(x+sx*unit*.06,y+sy*unit*.06,unit*.022,true,.8);
    }); break;
    case "diamonds": rect(m,.6); alongEdges(.18,(x,y)=>diamond(x,y,unit*.033)); break;
    case "triangles": rect(m,.6); alongEdges(.19,(x,y,horizontal,i)=>
      regular(x,y,unit*.034,3,(horizontal?Math.PI/2:0)+(i%2)*Math.PI,undefined,i%2===0)); break;
    case "zigzag": {
      const side=(length:number,horizontal:boolean,fixed:number) => {
        const count=Math.max(2,Math.min(50,Math.floor((length-2*m)/(unit*.08))));
        const points=Array.from({length:count+1},(_,i)=>{
          const along=m+i*(length-2*m)/count, offset=(i%2?1:-1)*unit*.025;
          return horizontal?{x:along,y:fixed+offset}:{x:fixed+offset,y:along};
        }); poly(points);
      };
      side(w,true,m);side(w,true,h-m);side(h,false,m);side(h,false,w-m); break;
    }
    case "squares": rect(m,.6); alongEdges(.18,(x,y)=>poly([
      {x:x-unit*.026,y:y-unit*.026},{x:x+unit*.026,y:y-unit*.026},
      {x:x+unit*.026,y:y+unit*.026},{x:x-unit*.026,y:y+unit*.026}],true)); break;
    case "hexagons": rect(m,.6); alongEdges(.19,(x,y)=>regular(x,y,unit*.034,6,Math.PI/6)); break;
    case "herringbone": rect(m,.7); alongEdges(.105,(x,y,horizontal,i)=>{
      const sign=i%2?1:-1, r=unit*.026;
      if(horizontal)line(x-r,y-sign*r,x+r,y+sign*r);
      else line(x-sign*r,y-r,x+sign*r,y+r);
    }); break;
    case "leaf-tips": rect(m,.75); corners((x,y,sx,sy)=>{
      leaf(x+sx*unit*.055,y+sy*unit*.022,unit*.038,0,true);
      leaf(x+sx*unit*.022,y+sy*unit*.055,unit*.038,Math.PI/2,true);
      ellipse(x+sx*unit*.018,y+sy*unit*.018,unit*.010,unit*.010,true,.7);
    }); break;
    case "corner-sprigs": rect(m,.7); corners((x,y,sx,sy)=>{
      line(x+sx*unit*.01,y+sy*unit*.01,x+sx*unit*.17,y+sy*unit*.17,.9);
      for(let i=1;i<=3;i++){
        const q=unit*(.025+i*.035);
        leaf(x+sx*(q+unit*.023),y+sy*(q-unit*.017),unit*.027,Math.PI/4*sx*sy,true);
        leaf(x+sx*(q-unit*.017),y+sy*(q+unit*.023),unit*.027,Math.PI/4*sx*sy,true);
      }
    }); break;
    case "leaf-garland": rect(m,.7); alongEdges(.16,(x,y,horizontal,i)=>
      leaf(x,y,unit*.035,(horizontal?0:Math.PI/2)+(i%2?-.6:.6),i%2===0)); break;
    case "flower-corners": rect(m,.8); rect(m+unit*.04,.6);
      corners((x,y)=>flower(x,y,unit*.047)); break;
    case "floral-garland": rect(m,.65);
      alongEdges(.23,(x,y)=>flower(x,y,unit*.042)); break;
    case "vines": rect(m,.7); alongEdges(.17,(x,y,horizontal,i)=>{
      const r=unit*.028, sign=i%2?1:-1;
      if(horizontal){leaf(x,y-sign*unit*.02,r,sign*.65,true); line(x,y,x,y-sign*unit*.015,.8);}
      else {leaf(x-sign*unit*.02,y,r,Math.PI/2-sign*.65,true); line(x,y,x-sign*unit*.015,y,.8);}
    }); break;
    case "confetti": rect(m,.6); alongEdges(.17,(x,y,_horizontal,i)=>{
      const r=unit*.027;
      if(i%3===0){line(x-r,y,x+r,y,1.2);line(x,y-r,x,y+r,1.2);}
      else if(i%3===1)ellipse(x,y,r*.55,r*.55,true,.7);
      else line(x-r,y-r,x+r,y+r,1.6);
    }); break;
    case "stars": rect(m,.6); alongEdges(.22,(x,y)=>regular(x,y,unit*.038,5,-Math.PI/2,.42,true)); break;
    case "hearts": rect(m,.6); alongEdges(.22,(x,y)=>heart(x,y,unit*.037)); break;
    case "bunting": rect(m,.7); alongEdges(.18,(x,y,horizontal,i)=>{
      const r=unit*.04, sign=horizontal?(y<h/2?1:-1):(x<w/2?1:-1);
      if(horizontal) poly([{x:x-r,y},{x:x+r,y},{x,y:y+sign*r}],true,i%2===0,.9);
      else poly([{x,y:y-r},{x,y:y+r},{x:x+sign*r,y}],true,i%2===0,.9);
    }); break;
    case "party-lights": rect(m,.7); alongEdges(.17,(x,y,horizontal,i)=>{
      const sign=horizontal?(y<h/2?1:-1):(x<w/2?1:-1), r=unit*.016;
      if(horizontal){line(x,y,x,y+sign*unit*.03,.8); ellipse(x,y+sign*unit*.038,r,r,i%2===0,.8);}
      else {line(x,y,x+sign*unit*.03,y,.8); ellipse(x+sign*unit*.038,y,r,r,i%2===0,.8);}
    }); break;
    case "sparkle": rect(m,.6); alongEdges(.2,(x,y,_horizontal,i)=>
      regular(x,y,unit*(i%2?.026:.043),4,-Math.PI/2,.25,i%2===0)); break;
  }
  return p;
}
